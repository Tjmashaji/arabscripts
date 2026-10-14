-- ملف الطالب والسائق: الإيقاف والانسحاب بسبب، وأكثر من ولي أمر للطالب. التعديل العادي للبيانات يمر عبر RLS مباشرة.

-- ========== حالة الطالب ==========
-- active: نشط، suspended: موقوف مؤقتًا (لا يدخل الرحلات ويبقى إسناده)، inactive: منسحب (يُلغى إسناده للمسارات)
create or replace function public.set_student_status(p_student uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.students; v_title text;
begin
  select * into s from public.students where id = p_student for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(s.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','inactive') then raise exception 'BAD_STATUS' using errcode = '22023'; end if;
  if p_status <> 'active' and coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if s.service_status = p_status then return; end if;

  update public.students set service_status = p_status, updated_at = now() where id = p_student;
  if p_status = 'inactive' then
    update public.student_route_assignments set status = 'inactive' where student_id = p_student and status = 'active';
  end if;

  v_title := case p_status when 'active' then 'عاد نقل ' || s.full_name
                           when 'suspended' then 'أُوقف نقل ' || s.full_name || ' مؤقتًا'
                           else 'انتهى اشتراك ' || s.full_name || ' في النقل' end;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select distinct g.user_id, s.school_id, 'student_status', v_title, coalesce(nullif(btrim(p_reason), ''), 'من إدارة المدرسة'),
         jsonb_build_object('student_id', p_student, 'status', p_status), 'student_status:' || p_student || ':' || p_status || ':' || now()::text
  from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id
  where gs.student_id = p_student and g.user_id is not null
  on conflict (user_id, dedupe_key) do nothing;
  perform private.audit(s.school_id, 'student_status', 'students', p_student::text,
    jsonb_build_object('service_status', s.service_status), jsonb_build_object('service_status', p_status, 'reason', p_reason));
end $$;
grant execute on function public.set_student_status(uuid, text, text) to authenticated;

-- ========== أولياء الأمور ==========
-- يُربط ولي الأمر بحسابه تلقائيًا عند دخوله بنفس البريد (claim_my_invites)
create or replace function public.add_student_guardian(p_student uuid, p_name text, p_phone text, p_email text, p_relation text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.students; v_guardian uuid; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into s from public.students where id = p_student;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(s.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if v_email is null and coalesce(btrim(p_phone), '') = '' then raise exception 'CONTACT_REQUIRED' using errcode = 'P0001'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL' using errcode = 'P0001'; end if;

  if v_email is not null then
    select id into v_guardian from public.guardians where school_id = s.school_id and lower(email) = v_email order by created_at limit 1;
  end if;
  if v_guardian is null then
    insert into public.guardians (school_id, full_name, phone, email, status)
      values (s.school_id, btrim(p_name), nullif(btrim(p_phone), ''), v_email, 'active') returning id into v_guardian;
  end if;
  if exists (select 1 from public.guardian_students where guardian_id = v_guardian and student_id = p_student) then
    raise exception 'ALREADY_LINKED' using errcode = 'P0001';
  end if;
  insert into public.guardian_students (guardian_id, student_id, relation, is_primary)
    values (v_guardian, p_student, nullif(btrim(p_relation), ''),
            not exists (select 1 from public.guardian_students where student_id = p_student));
  perform private.audit(s.school_id, 'add_guardian', 'guardian_students', p_student::text, null,
    jsonb_build_object('guardian_id', v_guardian, 'relation', p_relation));
  return v_guardian;
end $$;
grant execute on function public.add_student_guardian(uuid, text, text, text, text) to authenticated;

create or replace function public.remove_student_guardian(p_student uuid, p_guardian uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.students; v_primary boolean;
begin
  select * into s from public.students where id = p_student;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(s.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (select count(*) from public.guardian_students where student_id = p_student) <= 1 then
    raise exception 'LAST_GUARDIAN' using errcode = 'P0001';
  end if;
  delete from public.guardian_students where student_id = p_student and guardian_id = p_guardian returning is_primary into v_primary;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if v_primary then
    update public.guardian_students set is_primary = true
      where id = (select id from public.guardian_students where student_id = p_student order by created_at limit 1);
  end if;
  perform private.audit(s.school_id, 'remove_guardian', 'guardian_students', p_student::text,
    jsonb_build_object('guardian_id', p_guardian), null);
end $$;
grant execute on function public.remove_student_guardian(uuid, uuid) to authenticated;

-- ========== السائق ==========
create or replace function public.update_driver_profile(p_driver uuid, p_name text, p_phone text, p_email text, p_license text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.drivers; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into d from public.drivers where id = p_driver for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(d.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL' using errcode = 'P0001'; end if;
  -- بعد ربط الحساب يبقى البريد بريد صاحب الحساب
  if d.user_id is not null and v_email is distinct from lower(d.email) then raise exception 'EMAIL_LOCKED' using errcode = 'P0001'; end if;
  update public.drivers set full_name = btrim(p_name), phone = nullif(btrim(p_phone), ''), email = v_email,
      license_number = nullif(btrim(p_license), ''), updated_at = now()
    where id = p_driver;
  perform private.audit(d.school_id, 'driver_profile', 'drivers', p_driver::text,
    jsonb_build_object('full_name', d.full_name, 'phone', d.phone, 'email', d.email),
    jsonb_build_object('full_name', btrim(p_name), 'phone', p_phone, 'email', v_email));
end $$;
grant execute on function public.update_driver_profile(uuid, text, text, text, text) to authenticated;

-- إيقاف السائق أو إعادته. يعيد عدد رحلاته المجدولة اليوم حتى تعيّن المدرسة بديلًا.
create or replace function public.set_driver_status(p_driver uuid, p_status text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.drivers; v_today int;
begin
  select * into d from public.drivers where id = p_driver for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_school_role(d.school_id, array['school_admin','operations']) and not private.is_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended') then raise exception 'BAD_STATUS' using errcode = '22023'; end if;
  if p_status = 'suspended' and coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p_status = 'suspended' and exists (select 1 from public.trips t where t.driver_id = p_driver
       and t.status in ('in_progress','paused','emergency')) then
    raise exception 'DRIVER_ON_TRIP' using errcode = 'P0001';
  end if;
  if d.status <> p_status then
    update public.drivers set status = p_status, updated_at = now() where id = p_driver;
    if d.user_id is not null then
      insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
      values (d.user_id, d.school_id, 'driver_status',
              case when p_status = 'active' then 'أُعيد تفعيلك سائقًا' else 'أُوقفت مؤقتًا عن القيادة' end,
              coalesce(nullif(btrim(p_reason), ''), 'من إدارة المدرسة'), jsonb_build_object('status', p_status),
              'driver_status:' || p_driver || ':' || p_status || ':' || now()::text)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    perform private.audit(d.school_id, 'driver_status', 'drivers', p_driver::text,
      jsonb_build_object('status', d.status), jsonb_build_object('status', p_status, 'reason', p_reason));
  end if;
  select count(*) into v_today from public.trips t
    where t.driver_id = p_driver and t.trip_date = private.riyadh_today() and t.status in ('scheduled','ready');
  return jsonb_build_object('status', p_status, 'scheduled_today', v_today);
end $$;
grant execute on function public.set_driver_status(uuid, text, text) to authenticated;

-- ========== جاهزية المسار ==========
-- السائق الموقوف لا تُنشأ له رحلات، والطالب الموقوف أو المنسحب لا يُحسب
create or replace function private.route_not_ready(p_route uuid, p_date date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r public.routes;
begin
  select * into r from public.routes where id = p_route;
  if not found or not r.is_active or r.archived_at is not null then return 'ROUTE_INACTIVE'; end if;
  if not (extract(dow from p_date)::smallint = any(coalesce(r.days, '{0,1,2,3,4}'::smallint[]))) then return 'NOT_RUNNING_TODAY'; end if;
  if r.driver_id is null then return 'NO_DRIVER'; end if;
  if (select status from public.drivers where id = r.driver_id) <> 'active' then return 'DRIVER_SUSPENDED'; end if;
  if r.bus_id is null then return 'NO_BUS'; end if;
  if (select count(*) from public.route_stops s where s.route_id = p_route) < 2 then return 'NOT_ENOUGH_STOPS'; end if;
  if exists (select 1 from public.route_stops s where s.route_id = p_route and (s.latitude is null or s.longitude is null)) then
    return 'STOP_HAS_NO_LOCATION';
  end if;
  if not exists (select 1 from public.student_route_assignments a join public.students st on st.id = a.student_id
                 where a.route_id = p_route and a.status = 'active' and st.service_status = 'active') then
    return 'NO_STUDENTS';
  end if;
  return private.trip_blocker(r.school_id, r.bus_id, r.driver_id, p_date);
end $$;
