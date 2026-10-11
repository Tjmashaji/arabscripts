-- إشعارات فورية (Web Push): المفاتيح تُولَّد داخل دالة الحافة push وتُحفظ هنا، ولا تغادر Supabase.
create extension if not exists pg_net with schema extensions;

create table if not exists private.push_config (
  id int primary key default 1 check (id = 1),
  hook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public text,
  vapid_private text,
  created_at timestamptz not null default now()
);
insert into private.push_config(id) values (1) on conflict do nothing;

-- المفتاح العام فقط متاح للمتصفح لإنشاء الاشتراك.
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select vapid_public from private.push_config where id = 1
$$;

-- للدالة الخادمة فقط: ترفض أي مستدعٍ غير service_role.
create or replace function public.push_internal_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (select jsonb_build_object('hook_secret', hook_secret, 'vapid_public', vapid_public, 'vapid_private', vapid_private)
          from private.push_config where id = 1);
end $$;
create or replace function public.push_store_keys(p_public text, p_private text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update private.push_config set vapid_public = p_public, vapid_private = p_private where id = 1 and vapid_public is null;
  return found;
end $$;

-- كل إشعار جديد لمستخدم لديه جهاز مشترك يُرسل فورًا عبر دالة الحافة push.
create or replace function private.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if not exists (select 1 from public.device_tokens d where d.user_id = new.user_id) then return new; end if;
  if exists (select 1 from public.notification_preferences p where p.user_id = new.user_id and not p.push_enabled) then return new; end if;
  select hook_secret into v_secret from private.push_config where id = 1;
  perform net.http_post(
    url := 'https://hramsoavpanetdhwpokr.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('action', 'send', 'notification_id', new.id)
  );
  return new;
end $$;
create or replace trigger notifications_dispatch_push after insert on public.notifications
  for each row execute function private.dispatch_push();
