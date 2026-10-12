-- مراقبة الأعطال: أخطاء الواجهة عند المستخدمين تُسجَّل هنا ويراها مدير النظام مجمّعة.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  message text not null check (length(message) <= 500),
  stack text check (stack is null or length(stack) <= 4000),
  url text check (url is null or length(url) <= 500),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  app_version text check (app_version is null or length(app_version) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='client_errors' and policyname='client_errors_select') then
    create policy client_errors_select on public.client_errors for select to authenticated using (private.is_platform_admin());
  end if;
end $$;
revoke all on table public.client_errors from anon, authenticated;
grant select on table public.client_errors to authenticated;

-- تسجيل خطأ (بحد 30 خطأ في الساعة لكل مستخدم حتى لا يُغرق السجل)
create or replace function public.log_client_error(p_message text, p_stack text default null, p_url text default null, p_user_agent text default null, p_version text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  if (select count(*) from public.client_errors where user_id = (select auth.uid()) and created_at > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.client_errors (message, stack, url, user_agent, app_version)
  values (left(coalesce(nullif(btrim(p_message), ''), 'خطأ غير معروف'), 500), left(p_stack, 4000), left(p_url, 500), left(p_user_agent, 300), left(p_version, 40));
end $$;

-- ملخص الأخطاء لمدير النظام: مجمّعة حسب الرسالة
create or replace function public.admin_error_summary(p_days integer default 7)
returns table (message text, occurrences bigint, users bigint, first_seen timestamptz, last_seen timestamptz, sample_url text, sample_stack text, sample_agent text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select e.message, count(*), count(distinct e.user_id), min(e.created_at), max(e.created_at),
    (array_agg(e.url order by e.created_at desc))[1], (array_agg(e.stack order by e.created_at desc))[1], (array_agg(e.user_agent order by e.created_at desc))[1]
  from public.client_errors e where e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
  group by e.message order by max(e.created_at) desc limit 100;
end $$;
revoke execute on function public.log_client_error(text, text, text, text, text), public.admin_error_summary(integer) from anon, public;
grant execute on function public.log_client_error(text, text, text, text, text), public.admin_error_summary(integer) to authenticated;
