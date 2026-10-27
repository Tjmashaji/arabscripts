-- مساعد التعبئة الذكي (حصة الاستخدام اليومية): الصقه كاملًا في SQL Editor لمشروع auto-parts-eu ثم Run (مرة واحدة).
-- كله في معاملة واحدة: إن فشل أي سطر لا يتغير شيء.
begin;

-- مساعد التعبئة الذكي: حصة يومية لكل مستخدم وحد يومي للمنصة كلها، حتى لا تنفلت تكلفة الذكاء الاصطناعي.
-- لا يُحفظ هنا أي نص أو ملف أرسله المستخدم؛ فقط من استخدم المساعد ومتى ولأي نموذج.
-- الحدود قابلة للتعديل من ap_platform_settings (ai_daily_user_limit، ai_daily_total_limit).
-- اختبارات: supabase/tests/ai_assist.sql

create table public.ap_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  created_at timestamptz not null default now()
);
create index ap_ai_usage_user_time on public.ap_ai_usage (user_id, created_at);
create index ap_ai_usage_time on public.ap_ai_usage (created_at);
alter table public.ap_ai_usage enable row level security;
revoke all on public.ap_ai_usage from anon, authenticated;
revoke all on sequence public.ap_ai_usage_id_seq from anon, authenticated;

insert into public.ap_platform_settings (key, value, description) values
  ('ai_daily_user_limit', '30', 'عدد مرات استخدام مساعد التعبئة الذكي لكل مستخدم خلال 24 ساعة'),
  ('ai_daily_total_limit', '200', 'عدد مرات استخدام مساعد التعبئة الذكي للمنصة كلها خلال 24 ساعة (سقف التكلفة)')
on conflict (key) do nothing;

-- يحجز استخدامًا واحدًا إن بقي في الحصة، ويرجع false إن انتهت.
create or replace function public.ap_ai_quota_take(p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_user int; v_total int;
begin
  if uid is null or not ap_private.is_active_user(uid) then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  if coalesce(p_kind, '') !~ '^[a-z_]{2,40}$' then raise exception 'ap: invalid' using errcode = '22023'; end if;
  select coalesce((select (value #>> '{}')::int from public.ap_platform_settings where key = 'ai_daily_user_limit'), 30),
         coalesce((select (value #>> '{}')::int from public.ap_platform_settings where key = 'ai_daily_total_limit'), 200)
    into v_user, v_total;
  -- قفل قصير حتى لا يتجاوز طلبان متزامنان الحد.
  perform pg_advisory_xact_lock(hashtext('ap_ai_quota'));
  if (select count(*) from public.ap_ai_usage where user_id = uid and created_at > now() - interval '24 hours') >= v_user
     or (select count(*) from public.ap_ai_usage where created_at > now() - interval '24 hours') >= v_total then
    return false;
  end if;
  insert into public.ap_ai_usage (user_id, kind) values (uid, p_kind);
  delete from public.ap_ai_usage where created_at < now() - interval '90 days';
  return true;
end $$;
revoke all on function public.ap_ai_quota_take(text) from public, anon;
grant execute on function public.ap_ai_quota_take(text) to authenticated;

commit;

-- تحقق (يجب أن تكون النتائج كلها true):
select to_regclass('public.ap_ai_usage') is not null as usage_table,
  to_regprocedure('public.ap_ai_quota_take(text)') is not null as quota_function,
  (select count(*) = 2 from public.ap_platform_settings where key in ('ai_daily_user_limit', 'ai_daily_total_limit')) as limits;
