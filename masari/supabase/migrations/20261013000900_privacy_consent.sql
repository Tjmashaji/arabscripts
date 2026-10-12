-- الخصوصية (نظام حماية البيانات الشخصية): موافقة موثقة على سياسة الخصوصية، وموافقة ولي الأمر عند تسجيل ابنه،
-- وحذف تلقائي لمواقع الباصات القديمة والإشعارات القديمة.

alter table public.profiles add column if not exists privacy_version text;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.student_onboarding_requests add column if not exists guardian_consent_at timestamptz;

-- الحساب الجديد: تُحفظ الموافقة التي أعطاها في نموذج التسجيل
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, full_name, status, privacy_version, privacy_accepted_at)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), 'pending',
          nullif(new.raw_user_meta_data->>'privacy_version', ''), case when nullif(new.raw_user_meta_data->>'privacy_version', '') is not null then now() end)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- الحسابات الحالية تقبل السياسة عند أول دخول بعد نشرها
create or replace function public.accept_privacy(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if coalesce(btrim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.profiles set privacy_version = btrim(p_version), privacy_accepted_at = now() where user_id = (select auth.uid());
  perform private.audit(null, 'privacy_accepted', 'profiles', (select auth.uid())::text, null, jsonb_build_object('version', p_version));
end $$;
revoke execute on function public.accept_privacy(text) from anon, public;
grant execute on function public.accept_privacy(text) to authenticated;

-- طلب ولي الأمر يتطلب إقراره بأنه ولي أمر الطالب وموافقته على معالجة بياناته
create or replace function private.validate_parent_student_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_school_staff(new.school_id) then
    if new.home_latitude is null or new.home_longitude is null then raise exception 'HOME_LOCATION_REQUIRED' using errcode = 'P0001'; end if;
    if coalesce(length(btrim(new.student_name)), 0) < 3 then raise exception 'STUDENT_NAME_REQUIRED' using errcode = 'P0001'; end if;
    if coalesce(length(btrim(new.parent_phone)), 0) < 9 then raise exception 'PHONE_REQUIRED' using errcode = 'P0001'; end if;
    if new.guardian_consent_at is null then raise exception 'GUARDIAN_CONSENT_REQUIRED' using errcode = 'P0001'; end if;
    new.guardian_consent_at := now();
    new.parent_email := (select lower(email) from auth.users where id = (select auth.uid()));
  end if;
  return new;
end $$;

-- my_access يعرض نسخة السياسة التي وافق عليها المستخدم
create or replace function public.my_access()
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'user_id', (select auth.uid()),
    'email', (select email from auth.users where id = (select auth.uid())),
    'email_confirmed', (select email_confirmed_at is not null from auth.users where id = (select auth.uid())),
    'status', coalesce((select status from public.profiles where user_id = (select auth.uid())), 'pending'),
    'full_name', (select full_name from public.profiles where user_id = (select auth.uid())),
    'privacy_version', (select privacy_version from public.profiles where user_id = (select auth.uid())),
    'platform_roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id = (select auth.uid())), '[]'::jsonb),
    'region', private.my_region(),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('school_id', m.school_id, 'role', m.role, 'status', m.status,
        'school_name', s.name, 'school_status', s.status))
      from public.school_members m join public.schools s on s.id = m.school_id where m.user_id = (select auth.uid())), '[]'::jsonb),
    'driver', (select jsonb_build_object('id', d.id, 'school_id', d.school_id, 'status', d.status, 'full_name', d.full_name)
      from public.drivers d where d.user_id = (select auth.uid()) limit 1),
    'guardian', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'school_id', g.school_id, 'status', g.status))
      from public.guardians g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'pending_school_requests', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status))
      from public.schools s where s.created_by = (select auth.uid()) and s.status = 'pending'), '[]'::jsonb)
  ) end
$function$;
