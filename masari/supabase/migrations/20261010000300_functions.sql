-- مساري — الدوال الخادمية (RPC) والتحقق في قاعدة البيانات
-- كل عملية تشغيلية حساسة تمر من هنا، لا من الواجهة:
-- بدء الرحلة، اعتماد المحطة (النطاق الجغرافي والترتيب)، الحضور وQR، إنهاء الرحلة،
-- الطوارئ، ربط الحسابات، الاعتمادات. الأخطاء ترجع برموز ثابتة (message) تترجمها الواجهة.

-- ───────────────────────── حقول إضافية ─────────────────────────
alter table public.driver_onboarding_requests add column if not exists review_note text;
alter table public.student_onboarding_requests add column if not exists review_note text;
alter table public.emergency_reports add column if not exists resolution_note text;
alter table public.emergency_reports add column if not exists acknowledged_by uuid references auth.users(id);
alter table public.emergency_reports add column if not exists acknowledged_at timestamptz;
alter table public.schools add column if not exists emergency_phone text;

-- ───────────────────────── تجاوز حراسة الحقول من الدوال الموثوقة فقط ─────────────────────────
-- الدوال الخادمية تضبط masari.trusted محليًا داخل المعاملة. العميل لا يستطيع ضبطه عبر الـ API.
create or replace function private.trusted() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('masari.trusted', true), '') = 'on'
$$;

create or replace function private.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.trusted() and not private.is_platform_admin()
     and (new.status is distinct from old.status or new.user_id is distinct from old.user_id) then
    raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.guard_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.trusted() and not private.is_platform_admin()
     and (new.status is distinct from old.status or new.created_by is distinct from old.created_by) then
    raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
  end if;
  return new;
end $$;

-- ───────────────────────── منع الربط بين مدرستين ─────────────────────────
create or replace function private.check_same_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'buses' then
    if new.driver_id is not null and (select school_id from public.drivers where id = new.driver_id) is distinct from new.school_id then
      raise exception 'CROSS_SCHOOL_REFERENCE' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'routes' then
    if (new.driver_id is not null and (select school_id from public.drivers where id = new.driver_id) is distinct from new.school_id)
       or (new.bus_id is not null and (select school_id from public.buses where id = new.bus_id) is distinct from new.school_id) then
      raise exception 'CROSS_SCHOOL_REFERENCE' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'trips' then
    if (select school_id from public.routes where id = new.route_id) is distinct from new.school_id
       or (new.driver_id is not null and (select school_id from public.drivers where id = new.driver_id) is distinct from new.school_id)
       or (new.bus_id is not null and (select school_id from public.buses where id = new.bus_id) is distinct from new.school_id) then
      raise exception 'CROSS_SCHOOL_REFERENCE' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create or replace trigger buses_same_school before insert or update on public.buses
  for each row execute function private.check_same_school();
create or replace trigger routes_same_school before insert or update on public.routes
  for each row execute function private.check_same_school();
create or replace trigger trips_same_school before insert or update on public.trips
  for each row execute function private.check_same_school();

-- ───────────────────────── الإشعارات (داخلية) ─────────────────────────
-- p_pref: اسم عمود في notification_preferences، أو null للإشعارات الإلزامية (الطوارئ).
-- dedupe_key يمنع تكرار الإشعار نفسه للمستخدم نفسه.
create or replace function private.notify_student_guardians(p_student uuid, p_type text, p_pref text,
  p_title text, p_body text, p_dedupe text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, school_id, type, title, body, data, dedupe_key)
  select distinct g.user_id, g.school_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  left join public.notification_preferences np on np.user_id = g.user_id
  where gs.student_id = p_student and g.user_id is not null and g.status = 'active'
    and (p_pref is null or coalesce((to_jsonb(np) ->> p_pref)::boolean, true))
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create or replace function private.notify_school_staff(p_school uuid, p_type text, p_title text, p_body text,
  p_dedupe text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, school_id, type, title, body, data, dedupe_key)
  select distinct m.user_id, p_school, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe
  from public.school_members m
  where m.school_id = p_school and m.status = 'active'
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create or replace function private.audit(p_school uuid, p_action text, p_table text, p_record text,
  p_old jsonb, p_new jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs(school_id, actor_id, action, table_name, record_id, old_values, new_values)
  values (p_school, (select auth.uid()), p_action, p_table, p_record, p_old, p_new)
$$;

create or replace function private.riyadh_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Riyadh')::date
$$;

-- ═════════════════════════ الحسابات ═════════════════════════

-- كل ما تحتاجه الواجهة لتحديد الدور. الصلاحية الفعلية تفرضها RLS، وهذا للعرض والتوجيه فقط.
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'user_id', (select auth.uid()),
    'email', (select email from auth.users where id = (select auth.uid())),
    'email_confirmed', (select email_confirmed_at is not null from auth.users where id = (select auth.uid())),
    'status', coalesce((select status from public.profiles where user_id = (select auth.uid())), 'pending'),
    'full_name', (select full_name from public.profiles where user_id = (select auth.uid())),
    'platform_roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id = (select auth.uid())), '[]'::jsonb),
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
$$;

-- ربط حساب جديد بسجل سائق أو ولي أمر أضافته المدرسة بنفس البريد (بعد تأكيد البريد فقط).
-- المدرسة النشطة هي التي اعتمدت الشخص، فيُفعَّل الحساب تلقائيًا عند الربط.
create or replace function public.claim_my_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_confirmed timestamptz;
  v_drivers int := 0; v_guardians int := 0; v_activated boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is null or v_confirmed is null then
    return jsonb_build_object('linked_drivers', 0, 'linked_guardians', 0, 'activated', false, 'reason', 'EMAIL_NOT_CONFIRMED');
  end if;
  perform set_config('masari.trusted', 'on', true);

  if not exists (select 1 from public.drivers where user_id = v_uid) then
    update public.drivers set user_id = v_uid
    where id = (select d.id from public.drivers d
                where d.user_id is null and lower(d.email) = v_email and d.status <> 'suspended'
                order by d.created_at limit 1);
    get diagnostics v_drivers = row_count;
  end if;

  update public.guardians g set user_id = v_uid
  where g.user_id is null and lower(g.email) = v_email and g.status <> 'suspended'
    and not exists (select 1 from public.guardians g2 where g2.school_id = g.school_id and g2.user_id = v_uid);
  get diagnostics v_guardians = row_count;

  if exists (select 1 from public.drivers d join public.schools s on s.id = d.school_id
             where d.user_id = v_uid and d.status = 'active' and s.status = 'active')
     or exists (select 1 from public.guardians g join public.schools s on s.id = g.school_id
             where g.user_id = v_uid and g.status = 'active' and s.status = 'active') then
    update public.profiles set status = 'active' where user_id = v_uid and status = 'pending';
    v_activated := found;
  end if;

  return jsonb_build_object('linked_drivers', v_drivers, 'linked_guardians', v_guardians, 'activated', v_activated);
end $$;

create or replace function public.log_login() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  perform private.audit(null, 'login', 'auth.users', (select auth.uid())::text, null, null);
end $$;

-- ═════════════════════════ مدير النظام ═════════════════════════

-- اعتماد/تعليق مدرسة. عند الاعتماد يصبح منشئ الطلب مدير المدرسة ويُفعَّل حسابه.
create or replace function public.admin_set_school_status(p_school uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_creator uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','pending') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_status = 'suspended' and coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.schools set status = p_status where id = p_school returning created_by into v_creator;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_status = 'active' and v_creator is not null then
    perform set_config('masari.trusted', 'on', true);
    insert into public.school_members(school_id, user_id, role, status, created_by)
      values (p_school, v_creator, 'school_admin', 'active', (select auth.uid()))
      on conflict (school_id, user_id) do update set status = 'active';
    update public.profiles set status = 'active' where user_id = v_creator and status = 'pending';
  end if;
  if p_note is not null then
    perform private.audit(p_school, 'school_status_note', 'schools', p_school::text, null, jsonb_build_object('status', p_status, 'note', p_note));
  end if;
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if p_status not in ('pending','active','suspended') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_status = 'suspended' and coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.profiles set status = p_status where user_id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_note is not null then
    perform private.audit(null, 'user_status_note', 'profiles', p_user::text, null, jsonb_build_object('status', p_status, 'note', p_note));
  end if;
end $$;

-- منح/سحب أدوار المنصة. لا يمنح المدير نفسه ولا يسحب من نفسه.
create or replace function public.admin_set_platform_role(p_user uuid, p_role text, p_grant boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if p_role not in ('super_admin','executive') then raise exception 'INVALID_ROLE' using errcode = 'P0001'; end if;
  if p_grant then
    insert into public.user_roles(user_id, role, created_by) values (p_user, p_role, (select auth.uid()))
      on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
end $$;

-- إدارة المدرسة تضيف عضوًا (إدارة/عمليات/برج مراقبة) بحساب موجود ومؤكَّد البريد.
create or replace function public.school_add_member(p_school uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid;
begin
  if not private.is_school_admin(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_role not in ('school_admin','operations','control_tower') then raise exception 'INVALID_ROLE' using errcode = 'P0001'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  perform set_config('masari.trusted', 'on', true);
  insert into public.school_members(school_id, user_id, role, status, created_by)
    values (p_school, v_user, p_role, 'active', (select auth.uid()))
    on conflict (school_id, user_id) do update set role = excluded.role, status = 'active'
    returning id into v_id;
  update public.profiles set status = 'active' where user_id = v_user and status = 'pending';
  return v_id;
end $$;

-- ═════════════════════════ طلبات الانضمام ═════════════════════════

create or replace function public.review_driver_request(p_request uuid, p_approve boolean,
  p_note text default null, p_bus uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.driver_onboarding_requests; v_driver uuid;
begin
  select * into r from public.driver_onboarding_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_REVIEWED' using errcode = 'P0001'; end if;

  if not p_approve then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.driver_onboarding_requests
      set status = 'rejected', review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
      where id = p_request;
    return null;
  end if;

  begin
    insert into public.drivers(school_id, full_name, phone, email, status)
      values (r.school_id, r.driver_name, r.phone, nullif(lower(btrim(r.email)), ''), 'active')
      returning id into v_driver;
  exception when unique_violation then
    raise exception 'DUPLICATE_DRIVER' using errcode = 'P0001';
  end;

  if p_bus is not null then
    update public.buses set driver_id = v_driver where id = p_bus and school_id = r.school_id;
    if not found then raise exception 'BUS_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;

  update public.driver_onboarding_requests
    set status = 'approved', driver_id = v_driver, review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_request;
  return v_driver;
end $$;

-- اعتماد طلب طالب: ينشئ الطالب وولي الأمر ويربطهما. إن قدّم ولي الأمر الطلب بنفسه يُربط حسابه ويُفعَّل.
create or replace function public.review_student_request(p_request uuid, p_approve boolean, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.student_onboarding_requests; v_student uuid; v_guardian uuid;
  v_parent_user uuid; v_parent_email text;
begin
  select * into r from public.student_onboarding_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.status not in ('pending','pending_parent_account') then raise exception 'ALREADY_REVIEWED' using errcode = 'P0001'; end if;

  if not p_approve then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.student_onboarding_requests
      set status = 'rejected', review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
      where id = p_request;
    return null;
  end if;

  begin
    insert into public.students(school_id, full_name, grade, home_address, home_latitude, home_longitude,
        pickup_contact_name, pickup_contact_phone, service_status)
      values (r.school_id, btrim(r.student_name), r.grade, r.home_address, r.home_latitude, r.home_longitude,
        r.parent_name, r.parent_phone, 'active')
      returning id into v_student;
  exception when unique_violation then
    raise exception 'DUPLICATE_STUDENT' using errcode = 'P0001';
  end;

  -- ولي الأمر: صاحب الطلب إن لم يكن من موظفي المدرسة، وإلا بالبريد المدخل (يُربط حسابه لاحقًا عند التسجيل)
  if r.created_by is not null and not exists (
       select 1 from public.school_members m where m.user_id = r.created_by and m.school_id = r.school_id) then
    v_parent_user := r.created_by;
    select lower(email) into v_parent_email from auth.users where id = v_parent_user;
  else
    v_parent_email := nullif(lower(btrim(r.parent_email)), '');
  end if;

  if v_parent_user is not null then
    select id into v_guardian from public.guardians where school_id = r.school_id and user_id = v_parent_user;
  end if;
  if v_guardian is null and v_parent_email is not null then
    select id into v_guardian from public.guardians where school_id = r.school_id and lower(email) = v_parent_email;
  end if;
  if v_guardian is null then
    insert into public.guardians(school_id, user_id, full_name, phone, email, status)
      values (r.school_id, v_parent_user, coalesce(nullif(btrim(r.parent_name), ''), 'ولي الأمر'), r.parent_phone, v_parent_email, 'active')
      returning id into v_guardian;
  elsif v_parent_user is not null then
    update public.guardians set user_id = v_parent_user, status = 'active' where id = v_guardian and user_id is null;
  end if;

  insert into public.guardian_students(guardian_id, student_id, relation, is_primary)
    values (v_guardian, v_student, 'parent', true) on conflict (guardian_id, student_id) do nothing;

  if v_parent_user is not null then
    perform set_config('masari.trusted', 'on', true);
    update public.profiles set status = 'active' where user_id = v_parent_user and status = 'pending';
  end if;

  update public.student_onboarding_requests
    set status = 'approved', student_id = v_student, review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_request;
  return v_student;
end $$;

-- ═════════════════════════ الرحلات ═════════════════════════

-- بدء الرحلة: من السائق المخصص فقط، في يومها، وتُنسخ المحطات والطلاب لحظة البدء.
create or replace function public.start_trip(p_trip uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_driver uuid := private.my_driver_id();
  t public.trips; v_stops int; v_students int; s record;
begin
  if v_driver is null then raise exception 'NOT_ACTIVE_DRIVER' using errcode = '42501'; end if;
  select * into t from public.trips where id = p_trip for update;
  if not found or t.driver_id is distinct from v_driver then raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501'; end if;
  if t.status not in ('scheduled','ready') then raise exception 'TRIP_NOT_STARTABLE' using errcode = 'P0001'; end if;
  if t.trip_date <> private.riyadh_today() then raise exception 'TRIP_NOT_TODAY' using errcode = 'P0001'; end if;

  if not exists (select 1 from public.trip_stops where trip_id = p_trip) then
    insert into public.trip_stops(trip_id, route_stop_id, stop_order, label, stop_type, scheduled_time, latitude, longitude, radius_m)
      select p_trip, rs.id, rs.stop_order, rs.label, rs.stop_type, rs.scheduled_time, rs.latitude, rs.longitude, rs.radius_m
      from public.route_stops rs where rs.route_id = t.route_id order by rs.stop_order;
  end if;
  select count(*) into v_stops from public.trip_stops where trip_id = p_trip;
  if v_stops = 0 then raise exception 'ROUTE_HAS_NO_STOPS' using errcode = 'P0001'; end if;
  if exists (select 1 from public.trip_stops where trip_id = p_trip and (latitude is null or longitude is null)) then
    raise exception 'STOP_HAS_NO_LOCATION' using errcode = 'P0001';
  end if;

  -- الطلاب المعيّنون. من سجّل وليّ أمره غيابه مسبقًا يبقى غائبًا (on conflict do nothing).
  insert into public.trip_students(trip_id, student_id, trip_stop_id, status)
    select p_trip, a.student_id,
      (select ts.id from public.trip_stops ts where ts.trip_id = p_trip and ts.route_stop_id = a.stop_id),
      'not_boarded'
    from public.student_route_assignments a
    join public.students st on st.id = a.student_id and st.service_status = 'active'
    where a.route_id = t.route_id and a.status = 'active'
  on conflict (trip_id, student_id) do update set trip_stop_id = coalesce(public.trip_students.trip_stop_id, excluded.trip_stop_id);
  select count(*) into v_students from public.trip_students where trip_id = p_trip;

  begin
    update public.trips set status = 'in_progress', started_at = now() where id = p_trip;
  exception when unique_violation then
    raise exception 'DRIVER_OR_BUS_HAS_ACTIVE_TRIP' using errcode = 'P0001';
  end;

  insert into public.trip_events(trip_id, event_type, note) values (p_trip, 'trip_started', 'بدأت الرحلة');
  perform private.audit(t.school_id, 'trip_started', 'trips', p_trip::text, null, null);

  for s in select student_id from public.trip_students where trip_id = p_trip and status = 'not_boarded' loop
    perform private.notify_student_guardians(s.student_id, 'trip_started', 'bus_approaching',
      'بدأت رحلة الباص', 'الباص في الطريق. ستصلك التنبيهات عند الاقتراب.',
      'trip_started:' || p_trip || ':' || s.student_id, jsonb_build_object('trip_id', p_trip));
  end loop;

  return jsonb_build_object('trip_id', p_trip, 'stops', v_stops, 'students', v_students);
end $$;

-- اعتماد الوصول إلى المحطة: كل الشروط تُفحص هنا وليس في الواجهة فقط.
-- رحلة نشطة + السائق صاحبها + موقع GPS حقيقي بدقة مقبولة + المحطة هي التالية + لم تُعتمد + داخل النطاق.
-- النطاق = نصف قطر المحطة (أو إعداد المدرسة، 250م افتراضيًا) + سماحية بقدر الدقة لا تتجاوز 100م.
create or replace function public.arrive_at_stop(p_trip uuid, p_stop uuid, p_lat double precision,
  p_lng double precision, p_accuracy double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips; sc public.schools; st public.trip_stops; v_next uuid;
  v_radius int; v_allowed double precision; v_dist double precision;
  v_after public.trip_stops; s record; v_n int;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not private.is_trip_driver(p_trip) then raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501'; end if;
  if t.status <> 'in_progress' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'GPS_REQUIRED' using errcode = 'P0001';
  end if;
  select * into sc from public.schools where id = t.school_id;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > sc.max_gps_accuracy_m then
    raise exception 'GPS_ACCURACY_TOO_LOW' using errcode = 'P0001',
      detail = jsonb_build_object('accuracy', p_accuracy, 'max_accuracy', sc.max_gps_accuracy_m)::text;
  end if;

  select * into st from public.trip_stops where id = p_stop and trip_id = p_trip for update;
  if not found then raise exception 'STOP_NOT_IN_TRIP' using errcode = 'P0002'; end if;
  if st.status <> 'pending' then raise exception 'STOP_ALREADY_APPROVED' using errcode = 'P0001'; end if;
  select id into v_next from public.trip_stops where trip_id = p_trip and status = 'pending' order by stop_order limit 1;
  if v_next is distinct from p_stop then raise exception 'STOP_OUT_OF_ORDER' using errcode = 'P0001'; end if;

  v_radius := coalesce(st.radius_m, sc.stop_radius_m, 250);
  v_allowed := v_radius + least(p_accuracy, 100);
  v_dist := private.distance_m(p_lat, p_lng, st.latitude, st.longitude);
  if v_dist > v_allowed then
    raise exception 'OUTSIDE_STOP_RADIUS' using errcode = 'P0001',
      detail = jsonb_build_object('distance', round(v_dist), 'allowed', round(v_allowed), 'radius', v_radius)::text;
  end if;

  update public.trip_stops set status = 'arrived', arrived_at = now(), arrived_latitude = p_lat, arrived_longitude = p_lng,
    arrived_accuracy_m = p_accuracy, arrived_distance_m = v_dist where id = p_stop;
  insert into public.vehicle_locations(trip_id, latitude, longitude, accuracy, speed, heading, recorded_at)
    values (p_trip, p_lat, p_lng, p_accuracy, 0, null, now());
  insert into public.trip_events(trip_id, event_type, latitude, longitude, note)
    values (p_trip, 'stop_arrived', p_lat, p_lng, 'وصل الباص إلى ' || st.label || ' (' || round(v_dist) || 'م)');

  -- محطة المدرسة في رحلة الذهاب: كل من في الباص وصل المدرسة
  if st.stop_type = 'school' then
    for s in update public.trip_students set status = 'arrived_school', updated_at = now()
             where trip_id = p_trip and status = 'boarded' returning student_id loop
      insert into public.attendance_logs(school_id, trip_id, student_id, driver_id, event_type, method, latitude, longitude, note)
        values (t.school_id, p_trip, s.student_id, t.driver_id, 'arrived_school', 'system', p_lat, p_lng, st.label)
        on conflict (trip_id, student_id, event_type) do nothing;
      insert into public.trip_events(trip_id, student_id, event_type, latitude, longitude, note)
        values (p_trip, s.student_id, 'dropoff', p_lat, p_lng, 'وصل المدرسة');
      perform private.notify_student_guardians(s.student_id, 'arrived_school', 'arrived_school',
        'وصل ابنك إلى المدرسة', 'وصل الباص إلى ' || st.label || '.',
        'arrived_school:' || p_trip || ':' || s.student_id, jsonb_build_object('trip_id', p_trip));
    end loop;
  end if;

  -- تنبيه اقتراب الباص لطلاب المحطة التالية
  select * into v_after from public.trip_stops where trip_id = p_trip and status = 'pending' order by stop_order limit 1;
  if found then
    for s in select student_id from public.trip_students
             where trip_id = p_trip and trip_stop_id = v_after.id and status in ('not_boarded','waiting') loop
      perform private.notify_student_guardians(s.student_id, 'bus_approaching', 'bus_approaching',
        'الباص يقترب', 'الباص غادر ' || st.label || ' والمحطة التالية ' || v_after.label || '.',
        'approaching:' || p_trip || ':' || s.student_id, jsonb_build_object('trip_id', p_trip, 'stop_id', v_after.id));
    end loop;
    update public.trip_students set status = 'waiting', updated_at = now()
      where trip_id = p_trip and trip_stop_id = v_after.id and status = 'not_boarded';
  end if;

  select count(*) into v_n from public.trip_stops where trip_id = p_trip and status = 'pending';
  return jsonb_build_object('stop_id', p_stop, 'distance', round(v_dist), 'allowed', round(v_allowed),
    'next_stop_id', case when v_after.id is null then null else v_after.id end, 'remaining_stops', v_n);
end $$;

-- تخطي محطة (طريق مغلق مثلًا): بسبب إلزامي، ويُبلَّغ برج المراقبة. لا يُسجَّل صعود لطلابها.
create or replace function public.skip_stop(p_trip uuid, p_stop uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.trips; st public.trip_stops; v_next uuid;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not (private.is_trip_driver(p_trip) or private.is_school_staff(t.school_id)) then
    raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501';
  end if;
  if t.status <> 'in_progress' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into st from public.trip_stops where id = p_stop and trip_id = p_trip for update;
  if not found then raise exception 'STOP_NOT_IN_TRIP' using errcode = 'P0002'; end if;
  if st.status <> 'pending' then raise exception 'STOP_ALREADY_APPROVED' using errcode = 'P0001'; end if;
  select id into v_next from public.trip_stops where trip_id = p_trip and status = 'pending' order by stop_order limit 1;
  if v_next is distinct from p_stop then raise exception 'STOP_OUT_OF_ORDER' using errcode = 'P0001'; end if;
  if st.stop_type = 'school' then raise exception 'CANNOT_SKIP_SCHOOL' using errcode = 'P0001'; end if;

  update public.trip_stops set status = 'skipped', arrived_at = now() where id = p_stop;
  insert into public.trip_events(trip_id, event_type, note) values (p_trip, 'note', 'تخطي محطة ' || st.label || ': ' || p_reason);
  perform private.audit(t.school_id, 'stop_skipped', 'trip_stops', p_stop::text, null, jsonb_build_object('reason', p_reason));
  perform private.notify_school_staff(t.school_id, 'stop_skipped', 'تم تخطي محطة', st.label || ': ' || p_reason,
    'skip:' || p_stop, jsonb_build_object('trip_id', p_trip));
end $$;

-- الحضور: انتقالات منطقية فقط، ومنع التكرار، وربط الصعود/النزول بالوصول الفعلي للمحطة.
create or replace function public.record_attendance(p_trip uuid, p_student uuid, p_event text,
  p_method text default 'manual', p_lat double precision default null, p_lng double precision default null,
  p_device text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips; ts public.trip_students; v_stop public.trip_stops;
  v_is_driver boolean; v_is_staff boolean; v_ok boolean := false; v_trip_event text;
begin
  select * into t from public.trips where id = p_trip;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  v_is_driver := private.is_trip_driver(p_trip);
  v_is_staff := private.is_school_staff(t.school_id);
  if not (v_is_driver or v_is_staff) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_is_driver and not v_is_staff and t.status not in ('in_progress','emergency') then
    raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if t.status = 'cancelled' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if p_method not in ('manual','qr','system') then raise exception 'INVALID_METHOD' using errcode = 'P0001'; end if;

  select * into ts from public.trip_students where trip_id = p_trip and student_id = p_student for update;
  if not found then raise exception 'STUDENT_NOT_IN_TRIP' using errcode = 'P0002'; end if;

  -- الانتقالات المسموحة حسب اتجاه الرحلة
  if p_event = 'emergency' then
    v_ok := ts.status not in ('arrived_school','dropped_home','absent');
  elsif t.direction = 'to_school' then
    v_ok := (ts.status in ('not_boarded','waiting') and p_event in ('boarded','no_show','absent'))
         or (ts.status = 'boarded' and p_event = 'arrived_school');
  else
    v_ok := (ts.status in ('not_boarded','waiting') and p_event in ('boarded_return','no_show','absent'))
         or (ts.status = 'boarded_return' and p_event = 'dropped_home');
  end if;
  if not v_ok then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001',
      detail = jsonb_build_object('from', ts.status, 'to', p_event)::text;
  end if;

  -- الصعود/عدم الحضور في محطة الطالب، والنزول بالمنزل: يتطلب وصولًا معتمدًا لتلك المحطة (للسائق)
  if v_is_driver and not v_is_staff and ts.trip_stop_id is not null
     and p_event in ('boarded','boarded_return','no_show','dropped_home') then
    select * into v_stop from public.trip_stops where id = ts.trip_stop_id;
    -- في رحلة العودة الصعود من المدرسة (أول محطة)، فلا يُشترط وصول محطة المنزل له
    if not (t.direction = 'to_home' and p_event = 'boarded_return') and v_stop.status <> 'arrived' then
      raise exception 'STOP_NOT_REACHED' using errcode = 'P0001', detail = jsonb_build_object('stop', v_stop.label)::text;
    end if;
  end if;

  update public.trip_students set status = p_event, updated_at = now() where id = ts.id;
  insert into public.attendance_logs(school_id, trip_id, student_id, driver_id, event_type, method, device_info, latitude, longitude, note)
    values (t.school_id, p_trip, p_student, t.driver_id, p_event, p_method, left(p_device, 300), p_lat, p_lng, left(p_note, 500));

  v_trip_event := case p_event when 'boarded' then 'pickup' when 'boarded_return' then 'pickup'
    when 'arrived_school' then 'dropoff' when 'dropped_home' then 'dropoff'
    when 'emergency' then 'emergency' else 'absent' end;
  insert into public.trip_events(trip_id, student_id, event_type, latitude, longitude, note)
    values (p_trip, p_student, v_trip_event, p_lat, p_lng, coalesce(left(p_note, 200), p_event));

  if p_method = 'manual' then
    perform private.audit(t.school_id, 'manual_attendance', 'attendance_logs', p_student::text,
      jsonb_build_object('status', ts.status), jsonb_build_object('status', p_event, 'trip_id', p_trip));
  end if;

  if p_event in ('boarded','boarded_return') then
    perform private.notify_student_guardians(p_student, 'student_boarded', 'student_boarded',
      'صعد ابنك الباص', case when p_method = 'qr' then 'تم التسجيل بمسح الرمز.' else 'سجّل السائق الصعود.' end,
      'boarded:' || p_trip || ':' || p_student, jsonb_build_object('trip_id', p_trip));
  elsif p_event = 'arrived_school' then
    perform private.notify_student_guardians(p_student, 'arrived_school', 'arrived_school',
      'وصل ابنك إلى المدرسة', null, 'arrived_school:' || p_trip || ':' || p_student, jsonb_build_object('trip_id', p_trip));
  elsif p_event = 'dropped_home' then
    perform private.notify_student_guardians(p_student, 'dropped_home', 'dropped_home',
      'نزل ابنك عند المنزل', null, 'dropped:' || p_trip || ':' || p_student, jsonb_build_object('trip_id', p_trip));
  elsif p_event = 'no_show' then
    perform private.notify_student_guardians(p_student, 'no_show', 'delays',
      'لم يحضر ابنك إلى المحطة', 'غادر الباص المحطة دون صعوده.', 'noshow:' || p_trip || ':' || p_student, jsonb_build_object('trip_id', p_trip));
  elsif p_event = 'emergency' then
    perform private.notify_student_guardians(p_student, 'emergency', null,
      'حالة طارئة تخص ابنك', 'تواصل معك إدارة المدرسة الآن.', 'emergency:' || p_trip || ':' || p_student, jsonb_build_object('trip_id', p_trip));
  end if;

  return jsonb_build_object('student_id', p_student, 'from', ts.status, 'to', p_event);
end $$;

-- QR: الرمز عشوائي (UUID) لا يحمل بيانات شخصية. يُقبل فقط لطالب ضمن هذه الرحلة،
-- والحدث يُحدَّد من مرحلة الطالب في الرحلة. كل محاولة تُسجَّل في سجل التدقيق.
create or replace function public.record_attendance_qr(p_trip uuid, p_qr text, p_lat double precision default null,
  p_lng double precision default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_token uuid; v_student uuid; v_status text; v_event text;
begin
  select * into t from public.trips where id = p_trip;
  if not found or not (private.is_trip_driver(p_trip) or private.is_school_staff(t.school_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_token := regexp_replace(btrim(p_qr), '^masari:qr:', '')::uuid;
  exception when others then
    perform private.audit(t.school_id, 'qr_rejected', 'trip_students', null, null, jsonb_build_object('trip_id', p_trip, 'reason', 'malformed'));
    raise exception 'QR_INVALID' using errcode = 'P0001';
  end;
  select ts.student_id, ts.status into v_student, v_status
    from public.trip_students ts join public.students s on s.id = ts.student_id
    where ts.trip_id = p_trip and s.qr_token = v_token;
  if v_student is null then
    perform private.audit(t.school_id, 'qr_rejected', 'trip_students', null, null, jsonb_build_object('trip_id', p_trip, 'reason', 'not_in_trip'));
    raise exception 'QR_NOT_IN_TRIP' using errcode = 'P0001';
  end if;
  v_event := case
    when t.direction = 'to_school' and v_status in ('not_boarded','waiting') then 'boarded'
    when t.direction = 'to_school' and v_status = 'boarded' then 'arrived_school'
    when t.direction = 'to_home' and v_status in ('not_boarded','waiting') then 'boarded_return'
    when t.direction = 'to_home' and v_status = 'boarded_return' then 'dropped_home'
    else null end;
  if v_event is null then raise exception 'ALREADY_RECORDED' using errcode = 'P0001'; end if;
  perform private.audit(t.school_id, 'qr_scan', 'trip_students', v_student::text, null, jsonb_build_object('trip_id', p_trip, 'event', v_event));
  return public.record_attendance(p_trip, v_student, v_event, 'qr', p_lat, p_lng, p_device, null);
end $$;

-- ولي الأمر يسجل غياب ابنه عن رحلة لم تبدأ بعد، أو يلغي الغياب.
create or replace function public.guardian_set_absence(p_trip uuid, p_student uuid, p_absent boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.trips;
begin
  if not private.is_guardian_of(p_student) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into t from public.trips where id = p_trip;
  if not found or not exists (select 1 from public.student_route_assignments a
                              where a.route_id = t.route_id and a.student_id = p_student and a.status = 'active') then
    raise exception 'STUDENT_NOT_IN_TRIP' using errcode = 'P0002';
  end if;
  if t.status not in ('scheduled','ready') then raise exception 'TRIP_ALREADY_STARTED' using errcode = 'P0001'; end if;
  if p_absent then
    insert into public.trip_students(trip_id, student_id, status) values (p_trip, p_student, 'absent')
      on conflict (trip_id, student_id) do update set status = 'absent', updated_at = now();
    insert into public.attendance_logs(school_id, trip_id, student_id, event_type, method, note)
      values (t.school_id, p_trip, p_student, 'absent', 'guardian', 'سجّله ولي الأمر')
      on conflict (trip_id, student_id, event_type) do nothing;
  else
    delete from public.attendance_logs where trip_id = p_trip and student_id = p_student and event_type = 'absent' and method = 'guardian';
    delete from public.trip_students where trip_id = p_trip and student_id = p_student and status = 'absent';
  end if;
end $$;

-- إنهاء الرحلة: يتطلب تأكيد السائق خلو الباص، ومعالجة كل المحطات، وعدم بقاء طالب مسجّل داخل الباص.
create or replace function public.complete_trip(p_trip uuid, p_bus_checked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_on_bus int; v_pending int;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not private.is_trip_driver(p_trip) then raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501'; end if;
  if t.status not in ('in_progress','paused') then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if not coalesce(p_bus_checked, false) then raise exception 'BUS_CHECK_REQUIRED' using errcode = 'P0001'; end if;
  select count(*) into v_pending from public.trip_stops where trip_id = p_trip and status = 'pending';
  if v_pending > 0 then
    raise exception 'STOPS_NOT_PROCESSED' using errcode = 'P0001', detail = jsonb_build_object('pending', v_pending)::text;
  end if;
  select count(*) into v_on_bus from public.trip_students where trip_id = p_trip and status in ('boarded','boarded_return');
  if v_on_bus > 0 then
    raise exception 'STUDENTS_STILL_ON_BUS' using errcode = 'P0001', detail = jsonb_build_object('count', v_on_bus)::text;
  end if;

  update public.trips set status = 'completed', completed_at = now() where id = p_trip;
  insert into public.trip_events(trip_id, event_type, note) values (p_trip, 'trip_completed', 'انتهت الرحلة بعد تأكيد السائق خلو الباص');
  perform private.audit(t.school_id, 'trip_completed', 'trips', p_trip::text, null, jsonb_build_object('bus_checked', true));
  return jsonb_build_object('trip_id', p_trip,
    'duration_minutes', round(extract(epoch from (now() - t.started_at)) / 60),
    'stops', (select count(*) from public.trip_stops where trip_id = p_trip),
    'students', (select count(*) from public.trip_students where trip_id = p_trip));
end $$;

-- ═════════════════════════ الطوارئ ═════════════════════════

create or replace function public.report_emergency(p_trip uuid, p_type text, p_description text default null,
  p_lat double precision default null, p_lng double precision default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_id uuid;
begin
  if p_type not in ('emergency','breakdown','delay','accident','other') then raise exception 'INVALID_TYPE' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip;
  if not found or not (private.is_trip_driver(p_trip) or private.is_school_staff(t.school_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if t.status not in ('in_progress','paused','emergency') then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;

  insert into public.emergency_reports(school_id, trip_id, driver_id, type, description, latitude, longitude)
    values (t.school_id, p_trip, t.driver_id, p_type, left(p_description, 1000), p_lat, p_lng)
    returning id into v_id;
  insert into public.trip_events(trip_id, event_type, latitude, longitude, note)
    values (p_trip, case when p_type = 'delay' then 'delay' else 'emergency' end, p_lat, p_lng,
      coalesce(left(p_description, 200), 'بلاغ: ' || p_type));
  if p_lat is not null and p_lng is not null and private.is_trip_driver(p_trip) then
    insert into public.vehicle_locations(trip_id, latitude, longitude, recorded_at) values (p_trip, p_lat, p_lng, now());
  end if;
  perform private.notify_school_staff(t.school_id, 'emergency', 'بلاغ طارئ من الباص',
    coalesce(left(p_description, 200), p_type), 'emergency:' || v_id, jsonb_build_object('trip_id', p_trip, 'report_id', v_id));
  if p_type = 'delay' then
    perform private.notify_student_guardians(ts.student_id, 'delay', 'delays', 'تأخير في الرحلة',
      coalesce(left(p_description, 200), 'الباص متأخر عن موعده.'), 'delay:' || v_id || ':' || ts.student_id,
      jsonb_build_object('trip_id', p_trip))
    from public.trip_students ts where ts.trip_id = p_trip and ts.status not in ('absent','arrived_school','dropped_home');
  end if;
  return v_id;
end $$;

-- استلام البلاغ ثم إغلاقه بملاحظة إلزامية (برج المراقبة/الإدارة).
create or replace function public.update_emergency(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.emergency_reports;
begin
  select * into r from public.emergency_reports where id = p_report for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (private.can_view_school(r.school_id) and (private.is_platform_admin() or exists (
      select 1 from public.school_members m where m.school_id = r.school_id and m.user_id = (select auth.uid()) and m.status = 'active'))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status = 'acknowledged' and r.status = 'open' then
    update public.emergency_reports set status = 'acknowledged', acknowledged_by = (select auth.uid()), acknowledged_at = now() where id = p_report;
  elsif p_status = 'resolved' and r.status in ('open','acknowledged') then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.emergency_reports set status = 'resolved', resolved_by = (select auth.uid()), resolved_at = now(),
      resolution_note = p_note where id = p_report;
  else
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
end $$;

-- ═════════════════════════ برج المراقبة ═════════════════════════
-- الرحلات النشطة مع آخر موقع. security invoker: تطبق RLS على المستدعي، فكل جهة ترى نطاقها فقط.
create or replace function public.live_trips() returns table (
  trip_id uuid, school_id uuid, school_name text, route_name text, direction text, status text,
  driver_name text, bus_number text, plate_number text, started_at timestamptz,
  latitude double precision, longitude double precision, accuracy double precision, speed double precision,
  heading double precision, last_seen timestamptz, offline_after_seconds int,
  stops_total bigint, stops_done bigint, next_stop text, students_on_bus bigint, open_emergencies bigint)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.school_id, s.name, r.name, t.direction, t.status,
    d.full_name, b.bus_number, b.plate_number, t.started_at,
    loc.latitude, loc.longitude, loc.accuracy, loc.speed, loc.heading, loc.created_at, s.offline_after_seconds,
    (select count(*) from public.trip_stops x where x.trip_id = t.id),
    (select count(*) from public.trip_stops x where x.trip_id = t.id and x.status <> 'pending'),
    (select x.label from public.trip_stops x where x.trip_id = t.id and x.status = 'pending' order by x.stop_order limit 1),
    (select count(*) from public.trip_students x where x.trip_id = t.id and x.status in ('boarded','boarded_return')),
    (select count(*) from public.emergency_reports e where e.trip_id = t.id and e.status <> 'resolved')
  from public.trips t
  join public.schools s on s.id = t.school_id
  join public.routes r on r.id = t.route_id
  left join public.drivers d on d.id = t.driver_id
  left join public.buses b on b.id = t.bus_id
  left join lateral (select v.* from public.vehicle_locations v where v.trip_id = t.id order by v.created_at desc limit 1) loc on true
  where t.status in ('in_progress','paused','emergency')
$$;

-- ───────────────────────── الصلاحيات على الدوال ─────────────────────────
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
-- دوال داخلية لا يحتاجها أي دور مباشرة
revoke execute on function private.notify_student_guardians(uuid, text, text, text, text, text, jsonb) from authenticated;
revoke execute on function private.notify_school_staff(uuid, text, text, text, text, jsonb) from authenticated;
revoke execute on function private.audit(uuid, text, text, text, jsonb, jsonb) from authenticated;
alter default privileges in schema private revoke execute on functions from public, anon;
