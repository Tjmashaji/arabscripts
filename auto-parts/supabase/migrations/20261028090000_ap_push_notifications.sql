-- الإشعارات الفورية لتطبيق الجوال.
-- كل إشعار يُسجَّل في ap_notifications (كما كان) يُرسل أيضًا لأجهزة صاحبه المسجلة: القاعدة تستدعي
-- مسار المنصة /api/push/dispatch (عبر pg_net بعد نجاح العملية) ومعه الرموز ونوع الإشعار ولغة المستخدم،
-- والمسار يرسل عبر Firebase (أندرويد) وAPNs (آيفون). لا يلزم مفتاح الخدمة في المنصة.
-- الإعداد: رابط المسار في ap_platform_settings.push_webhook_url، والسر المشترك في Vault باسم ap_push_webhook_secret
-- (نفس قيمته في Vercel: PUSH_WEBHOOK_SECRET). بدون أي منهما لا يُرسل شيء.
-- اختبارات: supabase/tests/push.sql

create extension if not exists pg_net;

create table public.ap_push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  user_id uuid not null references public.ap_profiles (user_id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index ap_push_tokens_user_idx on public.ap_push_tokens (user_id);
alter table public.ap_push_tokens enable row level security;
revoke all on public.ap_push_tokens from anon, authenticated;
grant select on public.ap_push_tokens to authenticated;
create policy ap_push_tokens_read_own on public.ap_push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.ap_platform_settings (key, value, description, is_public) values
  ('push_webhook_url', '""', 'رابط إرسال الإشعارات الفورية: https://<نطاق المنصة>/api/push/dispatch (فارغ = متوقف)', false)
on conflict (key) do nothing;

-- يسجّل جهاز المستخدم الحالي (الرمز ينتقل لصاحبه الجديد إن سُجّل الدخول بحساب آخر على نفس الجهاز).
create or replace function public.ap_register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not ap_private.is_active_user(auth.uid()) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_platform not in ('android', 'ios') or char_length(coalesce(p_token, '')) not between 20 and 4096 then
    raise exception 'ap: invalid token' using errcode = '22023';
  end if;
  insert into public.ap_push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
  -- حد معقول للأجهزة لكل مستخدم: يُبقي أحدث 10.
  delete from public.ap_push_tokens where user_id = auth.uid() and token not in
    (select token from public.ap_push_tokens where user_id = auth.uid() order by last_seen_at desc limit 10);
end $$;

-- عند تسجيل الخروج: يتوقف الجهاز عن استقبال إشعارات هذا الحساب.
create or replace function public.ap_unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.ap_push_tokens where token = p_token and user_id = auth.uid() $$;

create or replace function ap_private.push_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ap_push_webhook_secret' limit 1 $$;

-- المسار يبلغ عن رموز لم تعد صالحة (حُذف التطبيق مثلًا) فتُحذف. محمي بالسر المشترك.
create or replace function public.ap_push_tokens_invalid(p_secret text, p_tokens text[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_secret text := ap_private.push_secret(); n int;
begin
  if v_secret is null or p_secret is null or p_secret <> v_secret then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  delete from public.ap_push_tokens where token = any(p_tokens);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function ap_private.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_tokens jsonb; v_locale text;
begin
  select nullif(value #>> '{}', '') into v_url from public.ap_platform_settings where key = 'push_webhook_url';
  v_secret := ap_private.push_secret();
  if v_url is null or v_url !~ '^https://' or v_secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('token', token, 'platform', platform)) into v_tokens
    from public.ap_push_tokens where user_id = new.user_id;
  if v_tokens is null then return new; end if;
  select locale into v_locale from public.ap_user_preferences where user_id = new.user_id;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id, 'kind', new.kind, 'payload', new.payload, 'locale', coalesce(v_locale, 'ar'), 'tokens', v_tokens),
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000);
  return new;
exception when others then
  -- الإشعار الفوري إضافة: فشله لا يُفشل العملية الأصلية (الإشعار محفوظ في الصفحة).
  return new;
end $$;
create trigger ap_notifications_push after insert on public.ap_notifications
  for each row execute function ap_private.dispatch_push();

revoke all on function ap_private.push_secret(), ap_private.dispatch_push() from public, anon, authenticated;
revoke all on function public.ap_register_push_token(text, text), public.ap_unregister_push_token(text),
  public.ap_push_tokens_invalid(text, text[]) from public, anon;
grant execute on function public.ap_register_push_token(text, text), public.ap_unregister_push_token(text) to authenticated;
grant execute on function public.ap_push_tokens_invalid(text, text[]) to anon, authenticated;
