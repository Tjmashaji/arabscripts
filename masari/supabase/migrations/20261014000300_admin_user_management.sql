-- مدير النظام: تغيير دور أي حساب، والإيقاف المؤقت (يُرفع تلقائيًا)، وحذف الحساب نهائيًا.

alter table public.profiles add column if not exists suspended_until timestamptz;

-- ───────── الإيقاف (دائم أو مؤقت) وإعادة التفعيل ─────────
-- الإيقاف يمنع الدخول من Supabase Auth نفسه (banned_until) إضافة لحالة الحساب.
create or replace function public.admin_suspend_user(p_user uuid, p_until timestamptz, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p_until is not null and p_until <= now() then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.profiles set status = 'suspended', suspended_until = p_until where user_id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  update auth.users set banned_until = coalesce(p_until, now() + interval '100 years') where id = p_user;
  perform private.audit(null, 'user_suspended', 'profiles', p_user::text, null,
    jsonb_build_object('until', p_until, 'note', btrim(p_note)));
end $$;
revoke execute on function public.admin_suspend_user(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_suspend_user(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if p_status not in ('pending','active','suspended') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_status = 'suspended' then perform public.admin_suspend_user(p_user, null, p_note); return; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.profiles set status = p_status, suspended_until = null where user_id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  update auth.users set banned_until = null where id = p_user;
  perform private.audit(null, 'user_status', 'profiles', p_user::text, null, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- رفع الإيقاف المؤقت تلقائيًا عند انتهاء مدته
create or replace function private.lift_expired_suspensions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform set_config('masari.trusted', 'on', true);
  with lifted as (
    update public.profiles set status = 'active', suspended_until = null
    where status = 'suspended' and suspended_until is not null and suspended_until <= now()
    returning user_id)
  update auth.users u set banned_until = null from lifted where u.id = lifted.user_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function private.lift_expired_suspensions() from public, anon, authenticated;
select cron.schedule('masari-lift-suspensions', '*/10 * * * *', $$select private.lift_expired_suspensions()$$)
where not exists (select 1 from cron.job where jobname = 'masari-lift-suspensions');

-- ───────── قائمة المستخدمين مع الفلاتر ─────────
create or replace function public.admin_users(p_query text default null, p_status text default null, p_role text default null)
returns table (user_id uuid, email text, full_name text, phone text, status text, suspended_until timestamptz, email_confirmed boolean,
               created_at timestamptz, last_sign_in_at timestamptz, platform_roles jsonb, schools jsonb, driver jsonb, guardian_schools jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select * from (
    select u.id, u.email::text, p.full_name, p.phone, coalesce(p.status, 'pending'), p.suspended_until, u.email_confirmed_at is not null, u.created_at, u.last_sign_in_at,
      coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'region', r.region)) from public.user_roles r where r.user_id = u.id), '[]'::jsonb) as pr,
      coalesce((select jsonb_agg(jsonb_build_object('school_id', m.school_id, 'school_name', s.name, 'role', m.role, 'status', m.status))
                from public.school_members m join public.schools s on s.id = m.school_id where m.user_id = u.id), '[]'::jsonb) as sm,
      (select jsonb_build_object('school_id', d.school_id, 'school_name', s.name, 'status', d.status) from public.drivers d join public.schools s on s.id = d.school_id where d.user_id = u.id) as dr,
      coalesce((select jsonb_agg(jsonb_build_object('school_id', g.school_id, 'school_name', s.name)) from public.guardians g join public.schools s on s.id = g.school_id where g.user_id = u.id), '[]'::jsonb) as gs
    from auth.users u left join public.profiles p on p.user_id = u.id
    where (coalesce(btrim(p_query), '') = '' or u.email ilike '%' || btrim(p_query) || '%' or p.full_name ilike '%' || btrim(p_query) || '%' or p.phone ilike '%' || btrim(p_query) || '%')
      and (p_status is null or coalesce(p.status, 'pending') = p_status)
  ) x
  where p_role is null
     or (p_role = 'super_admin' and x.pr @> '[{"role":"super_admin"}]')
     or (p_role = 'executive' and x.pr @> '[{"role":"executive"}]')
     or (p_role = 'school' and jsonb_array_length(x.sm) > 0)
     or (p_role = 'driver' and x.dr is not null)
     or (p_role = 'guardian' and jsonb_array_length(x.gs) > 0)
     or (p_role = 'none' and x.pr = '[]'::jsonb and jsonb_array_length(x.sm) = 0 and x.dr is null and jsonb_array_length(x.gs) = 0)
  order by x.created_at desc
  limit 500;
end $$;
revoke execute on function public.admin_users(text, text, text) from public, anon;
grant execute on function public.admin_users(text, text, text) to authenticated;
