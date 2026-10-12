-- رسائل SMS وواتساب لأهم التنبيهات (لمن يفعّلها): الصعود، الوصول للمدرسة، النزول، اقتراب الباص، الطوارئ.
-- الرسائل تُصفّ في private.message_outbox، والدالة الطرفية messages ترسلها عبر المزوّد المضبوط
-- (Twilio أو Unifonic) من أسرار Supabase. بلا مزوّد تبقى الرسائل بحالة no_provider ولا يحدث شيء.

alter table public.notification_preferences add column if not exists sms_enabled boolean not null default false;
alter table public.notification_preferences add column if not exists whatsapp_enabled boolean not null default false;

create table if not exists private.message_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('sms','whatsapp')),
  phone text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','no_provider')),
  attempts int not null default 0,
  error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists message_outbox_status on private.message_outbox (status, created_at);
create index if not exists message_outbox_user on private.message_outbox (user_id);
create index if not exists message_outbox_notification on private.message_outbox (notification_id);

-- رقم الجوال: من الملف الشخصي أو من سجل ولي الأمر
create or replace function private.user_phone(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(btrim(phone), '') from public.profiles where user_id = p_user),
    (select nullif(btrim(phone), '') from public.guardians where user_id = p_user and phone is not null order by created_at desc limit 1))
$$;

create or replace function private.queue_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.notification_preferences; v_phone text; v_secret text; v_body text;
begin
  if new.type not in ('student_boarded','arrived_school','dropped_home','bus_eta','bus_approaching','emergency','child_on_bus','trip_late','pickup_released') then return new; end if;
  select * into p from public.notification_preferences where user_id = new.user_id;
  if not found or not (p.sms_enabled or p.whatsapp_enabled) then return new; end if;
  v_phone := private.user_phone(new.user_id);
  if v_phone is null then return new; end if;
  v_body := 'مساري: ' || new.title || coalesce(' — ' || left(new.body, 220), '');
  if p.sms_enabled then insert into private.message_outbox (notification_id, user_id, channel, phone, body) values (new.id, new.user_id, 'sms', v_phone, v_body); end if;
  if p.whatsapp_enabled then insert into private.message_outbox (notification_id, user_id, channel, phone, body) values (new.id, new.user_id, 'whatsapp', v_phone, v_body); end if;
  select hook_secret into v_secret from private.push_config where id = 1;
  perform net.http_post(
    url := 'https://hramsoavpanetdhwpokr.supabase.co/functions/v1/messages',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('action', 'send'));
  return new;
end $$;
create or replace trigger notifications_queue_messages after insert on public.notifications
  for each row execute function private.queue_messages();

-- للدالة الطرفية فقط (service_role): استلام دفعة وتسجيل النتيجة
create or replace function public.messages_internal_claim(p_limit int default 50)
returns table (id uuid, channel text, phone text, body text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  update private.message_outbox o set status = 'sending', attempts = o.attempts + 1
  where o.id in (select x.id from private.message_outbox x
                 where (x.status = 'queued' or (x.status = 'failed' and x.attempts < 3 and x.created_at > now() - interval '1 hour'))
                 order by x.created_at limit p_limit for update skip locked)
  returning o.id, o.channel, o.phone, o.body;
end $$;
revoke execute on function public.messages_internal_claim(int) from public, anon, authenticated;
grant execute on function public.messages_internal_claim(int) to service_role;

create or replace function public.messages_internal_result(p_id uuid, p_status text, p_error text default null, p_provider_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update private.message_outbox set status = p_status, error = left(p_error, 500), provider_id = p_provider_id,
    sent_at = case when p_status = 'sent' then now() else sent_at end where id = p_id;
end $$;
revoke execute on function public.messages_internal_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.messages_internal_result(uuid, text, text, text) to service_role;

-- إعادة المحاولة وإرسال ما فات كل خمس دقائق
create or replace function private.kick_messages() returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if not exists (select 1 from private.message_outbox where status in ('queued','failed') and created_at > now() - interval '1 hour') then return; end if;
  select hook_secret into v_secret from private.push_config where id = 1;
  perform net.http_post(url := 'https://hramsoavpanetdhwpokr.supabase.co/functions/v1/messages',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret), body := jsonb_build_object('action', 'send'));
end $$;
revoke execute on function private.kick_messages() from public, anon, authenticated;
select cron.schedule('masari-messages', '*/5 * * * *', $$select private.kick_messages()$$)
where not exists (select 1 from cron.job where jobname = 'masari-messages');

-- المستخدم يحفظ جواله
create or replace function public.set_my_phone(p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_phone is not null and btrim(p_phone) !~ '^\+?[0-9 -]{9,16}$' then raise exception 'INVALID_PHONE' using errcode = 'P0001'; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.profiles set phone = nullif(btrim(p_phone), '') where user_id = (select auth.uid());
end $$;
revoke execute on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

-- مدير النظام: حالة الرسائل
create or replace function public.admin_message_stats()
returns table (channel text, status text, n bigint, last_error text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query select o.channel, o.status, count(*), (array_agg(o.error order by o.created_at desc) filter (where o.error is not null))[1]
    from private.message_outbox o where o.created_at > now() - interval '30 days' group by o.channel, o.status order by 1, 2;
end $$;
revoke execute on function public.admin_message_stats() from public, anon;
grant execute on function public.admin_message_stats() to authenticated;
