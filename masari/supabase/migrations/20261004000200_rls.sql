-- مساري — دوال الصلاحيات وسياسات RLS (قابل لإعادة التطبيق)
-- القاعدة: لا شيء للزائر (anon). كل سياسة مشروطة بملكية أو عضوية، ولا تعتمد على user_metadata.

-- ───────────────────────── دوال التحقق (schema خاص غير مكشوف عبر الـ API) ─────────────────────────
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.status = 'active')
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'super_admin')
$$;

create or replace function private.is_executive() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role in ('super_admin','executive'))
$$;

-- إدارة المدرسة (كتابة): school_admin أو operations، أو مدير النظام
create or replace function private.is_school_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or (private.is_active_user() and exists (
    select 1 from public.school_members m join public.schools s on s.id = m.school_id
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'
      and m.role in ('school_admin','operations') and s.status = 'active'))
$$;

create or replace function private.is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or (private.is_active_user() and exists (
    select 1 from public.school_members m join public.schools s on s.id = m.school_id
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'
      and m.role = 'school_admin' and s.status = 'active'))
$$;

-- عرض بيانات المدرسة: الإدارة + برج المراقبة + الإدارة التنفيذية
create or replace function private.can_view_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_executive() or (private.is_active_user() and exists (
    select 1 from public.school_members m
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'))
$$;

create or replace function private.my_driver_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.drivers d
  where d.user_id = (select auth.uid()) and d.status = 'active' and private.is_active_user() limit 1
$$;

create or replace function private.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id
    where gs.student_id = p_student and g.user_id = (select auth.uid()) and g.status = 'active')
$$;

create or replace function private.is_my_guardian(p_guardian uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardians g where g.id = p_guardian and g.user_id = (select auth.uid()))
$$;

-- السائق يرى الطالب إذا كان مخصصًا لمساره أو ضمن رحلة له
create or replace function private.driver_has_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_driver_id() is not null and (
    exists (select 1 from public.student_route_assignments a join public.routes r on r.id = a.route_id
            where a.student_id = p_student and a.status = 'active' and r.driver_id = private.my_driver_id())
    or exists (select 1 from public.trip_students ts join public.trips t on t.id = ts.trip_id
            where ts.student_id = p_student and t.driver_id = private.my_driver_id()))
$$;

create or replace function private.is_trip_driver(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.driver_id = private.my_driver_id())
$$;

create or replace function private.guardian_in_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_students ts where ts.trip_id = p_trip and private.is_guardian_of(ts.student_id))
$$;

create or replace function private.guardian_in_route(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_route_assignments a
                 where a.route_id = p_route and a.status = 'active' and private.is_guardian_of(a.student_id))
$$;

create or replace function private.trip_is_live(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.status in ('in_progress','paused','emergency'))
$$;

create or replace function private.student_school(p_student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.students where id = p_student
$$;
create or replace function private.route_school(p_route uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.routes where id = p_route
$$;
create or replace function private.trip_school(p_trip uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.trips where id = p_trip
$$;
create or replace function private.guardian_school(p_guardian uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.guardians where id = p_guardian
$$;

-- المستخدم مرتبط بالمدرسة بأي صفة (إدارة/سائق/ولي أمر)
create or replace function private.user_in_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_view_school(p_school) or (private.is_active_user() and (
    exists (select 1 from public.drivers d where d.school_id = p_school and d.user_id = (select auth.uid()) and d.status = 'active')
    or exists (select 1 from public.guardians g where g.school_id = p_school and g.user_id = (select auth.uid()) and g.status = 'active')))
$$;

-- ───────────────────────── حماية الحقول الحساسة ─────────────────────────
-- المستخدم لا يغيّر حالة حسابه، وإدارة المدرسة لا تغيّر حالة اعتماد المدرسة.
create or replace function private.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin()
     and (new.status is distinct from old.status or new.user_id is distinct from old.user_id) then
    raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

create or replace function private.guard_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin()
     and (new.status is distinct from old.status or new.created_by is distinct from old.created_by) then
    raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger schools_guard before update on public.schools
  for each row execute function private.guard_school();

-- ───────────────────────── تفعيل RLS والصلاحيات الأساسية ─────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- جداول لا يكتب فيها العميل إطلاقًا (تُكتب من دوال خادمية أو مفتاح الخدمة)
revoke insert, update, delete on public.audit_logs, public.user_roles, public.payments,
  public.attendance_logs, public.trip_stops, public.trip_students from authenticated;
revoke insert, delete on public.notifications, public.profiles from authenticated;
revoke update on public.notifications, public.profiles from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
-- مدير النظام يدير الأدوار عبر الدوال في ملف functions

-- أداة: إعادة إنشاء السياسة
create or replace function private.pol(p_table text, p_name text, p_cmd text, p_using text, p_check text)
returns void language plpgsql set search_path = '' as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute format('create policy %I on public.%I for %s to authenticated %s %s', p_name, p_table, p_cmd,
    case when p_using is not null then 'using (' || p_using || ')' else '' end,
    case when p_check is not null then 'with check (' || p_check || ')' else '' end);
end $$;
revoke all on function private.pol(text, text, text, text, text) from public, anon, authenticated;

-- ───────────────────────── السياسات ─────────────────────────
do $$
declare
  staff_tables text[] := array['school_branches','students','guardians','drivers','buses','routes',
    'driver_onboarding_requests','subscriptions','invoices'];
  t text;
begin
  -- الحسابات
  perform private.pol('profiles', 'profiles_select', 'select', '(select auth.uid()) = user_id or private.is_platform_admin()', null);
  perform private.pol('profiles', 'profiles_update', 'update', '(select auth.uid()) = user_id or private.is_platform_admin()', '(select auth.uid()) = user_id or private.is_platform_admin()');
  perform private.pol('user_roles', 'user_roles_select', 'select', '(select auth.uid()) = user_id or private.is_platform_admin()', null);

  -- المدارس: طلب تسجيل مدرسة يبدأ pending وباسم صاحبه فقط
  perform private.pol('schools', 'schools_select', 'select', 'private.user_in_school(id) or created_by = (select auth.uid())', null);
  perform private.pol('schools', 'schools_insert', 'insert', null, '(status = ''pending'' and created_by = (select auth.uid())) or private.is_platform_admin()');
  perform private.pol('schools', 'schools_update', 'update', 'private.is_school_admin(id)', 'private.is_school_admin(id)');
  perform private.pol('schools', 'schools_delete', 'delete', 'private.is_platform_admin()', null);

  perform private.pol('school_members', 'school_members_select', 'select', 'user_id = (select auth.uid()) or private.can_view_school(school_id)', null);
  perform private.pol('school_members', 'school_members_insert', 'insert', null, 'private.is_school_admin(school_id)');
  perform private.pol('school_members', 'school_members_update', 'update', 'private.is_school_admin(school_id)', 'private.is_school_admin(school_id)');
  perform private.pol('school_members', 'school_members_delete', 'delete', 'private.is_school_admin(school_id)', null);

  -- جداول تديرها المدرسة: الكتابة للإدارة فقط وضمن مدرستها (USING + WITH CHECK يمنعان تغيير school_id)
  foreach t in array staff_tables loop
    perform private.pol(t, t || '_insert', 'insert', null, 'private.is_school_staff(school_id)');
    perform private.pol(t, t || '_update', 'update', 'private.is_school_staff(school_id)', 'private.is_school_staff(school_id)');
    perform private.pol(t, t || '_delete', 'delete', 'private.is_school_staff(school_id)', null);
  end loop;
  perform private.pol('school_branches', 'school_branches_select', 'select', 'private.user_in_school(school_id)', null);
  perform private.pol('students', 'students_select', 'select', 'private.can_view_school(school_id) or private.is_guardian_of(id) or private.driver_has_student(id)', null);
  perform private.pol('guardians', 'guardians_select', 'select', 'private.can_view_school(school_id) or user_id = (select auth.uid())', null);
  perform private.pol('drivers', 'drivers_select', 'select', 'private.can_view_school(school_id) or user_id = (select auth.uid()) or exists (select 1 from public.routes r where r.driver_id = drivers.id and private.guardian_in_route(r.id))', null);
  perform private.pol('buses', 'buses_select', 'select', 'private.can_view_school(school_id) or driver_id = private.my_driver_id() or exists (select 1 from public.routes r where r.bus_id = buses.id and private.guardian_in_route(r.id))', null);
  perform private.pol('routes', 'routes_select', 'select', 'private.can_view_school(school_id) or driver_id = private.my_driver_id() or private.guardian_in_route(id)', null);
  perform private.pol('driver_onboarding_requests', 'driver_onboarding_requests_select', 'select', 'private.can_view_school(school_id)', null);
  perform private.pol('subscriptions', 'subscriptions_select', 'select', 'private.can_view_school(school_id) or private.is_guardian_of(student_id)', null);
  perform private.pol('invoices', 'invoices_select', 'select', 'private.can_view_school(school_id) or private.is_my_guardian(guardian_id)', null);
  perform private.pol('payments', 'payments_select', 'select', 'private.can_view_school(school_id) or exists (select 1 from public.invoices i where i.id = payments.invoice_id and private.is_my_guardian(i.guardian_id))', null);

  perform private.pol('guardian_students', 'guardian_students_select', 'select', 'private.is_my_guardian(guardian_id) or private.can_view_school(private.student_school(student_id))', null);
  perform private.pol('guardian_students', 'guardian_students_insert', 'insert', null, 'private.is_school_staff(private.student_school(student_id)) and private.guardian_school(guardian_id) = private.student_school(student_id)');
  perform private.pol('guardian_students', 'guardian_students_update', 'update', 'private.is_school_staff(private.student_school(student_id))', 'private.is_school_staff(private.student_school(student_id)) and private.guardian_school(guardian_id) = private.student_school(student_id)');
  perform private.pol('guardian_students', 'guardian_students_delete', 'delete', 'private.is_school_staff(private.student_school(student_id))', null);

  -- طلب تسجيل طالب: الإدارة، أو مستخدم يقدم طلبًا باسمه بحالة pending
  perform private.pol('student_onboarding_requests', 'student_requests_select', 'select', 'private.can_view_school(school_id) or created_by = (select auth.uid())', null);
  perform private.pol('student_onboarding_requests', 'student_requests_insert', 'insert', null, 'private.is_school_staff(school_id) or (created_by = (select auth.uid()) and status = ''pending'' and student_id is null and reviewed_by is null)');
  perform private.pol('student_onboarding_requests', 'student_requests_update', 'update', 'private.is_school_staff(school_id)', 'private.is_school_staff(school_id)');
  perform private.pol('student_onboarding_requests', 'student_requests_delete', 'delete', 'private.is_school_staff(school_id)', null);

  -- المحطات وتعيين الطلاب
  perform private.pol('route_stops', 'route_stops_select', 'select', 'exists (select 1 from public.routes r where r.id = route_stops.route_id)', null);
  perform private.pol('route_stops', 'route_stops_insert', 'insert', null, 'private.is_school_staff(private.route_school(route_id))');
  perform private.pol('route_stops', 'route_stops_update', 'update', 'private.is_school_staff(private.route_school(route_id))', 'private.is_school_staff(private.route_school(route_id))');
  perform private.pol('route_stops', 'route_stops_delete', 'delete', 'private.is_school_staff(private.route_school(route_id))', null);

  perform private.pol('student_route_assignments', 'sra_select', 'select', 'private.can_view_school(private.route_school(route_id)) or private.is_guardian_of(student_id) or exists (select 1 from public.routes r where r.id = student_route_assignments.route_id and r.driver_id = private.my_driver_id())', null);
  perform private.pol('student_route_assignments', 'sra_insert', 'insert', null, 'private.is_school_staff(private.route_school(route_id))');
  perform private.pol('student_route_assignments', 'sra_update', 'update', 'private.is_school_staff(private.route_school(route_id))', 'private.is_school_staff(private.route_school(route_id))');
  perform private.pol('student_route_assignments', 'sra_delete', 'delete', 'private.is_school_staff(private.route_school(route_id))', null);

  -- الرحلات: الإدارة تجدول. السائق يغيّر الحالة عبر الدوال الخادمية فقط.
  perform private.pol('trips', 'trips_select', 'select', 'private.can_view_school(school_id) or driver_id = private.my_driver_id() or private.guardian_in_trip(id)', null);
  perform private.pol('trips', 'trips_insert', 'insert', null, 'private.is_school_staff(school_id) and private.route_school(route_id) = school_id');
  perform private.pol('trips', 'trips_update', 'update', 'private.is_school_staff(school_id)', 'private.is_school_staff(school_id) and private.route_school(route_id) = school_id');
  perform private.pol('trips', 'trips_delete', 'delete', 'private.is_school_staff(school_id)', null);

  perform private.pol('trip_stops', 'trip_stops_select', 'select', 'exists (select 1 from public.trips t where t.id = trip_stops.trip_id)', null);
  -- ولي الأمر يرى ابنه فقط داخل الرحلة، لا بقية طلاب الباص
  perform private.pol('trip_students', 'trip_students_select', 'select', 'private.can_view_school(private.trip_school(trip_id)) or private.is_trip_driver(trip_id) or private.is_guardian_of(student_id)', null);

  -- الموقع: ولي الأمر يراه أثناء الرحلة النشطة لابنه فقط. السائق يكتب لرحلته الجارية فقط.
  perform private.pol('vehicle_locations', 'vehicle_locations_select', 'select', 'private.can_view_school(private.trip_school(trip_id)) or private.is_trip_driver(trip_id) or (private.trip_is_live(trip_id) and private.guardian_in_trip(trip_id))', null);
  perform private.pol('vehicle_locations', 'vehicle_locations_insert', 'insert', null, 'private.is_trip_driver(trip_id) and private.trip_is_live(trip_id)');

  perform private.pol('attendance_logs', 'attendance_select', 'select', 'private.can_view_school(school_id) or private.is_trip_driver(trip_id) or private.is_guardian_of(student_id)', null);

  perform private.pol('trip_events', 'trip_events_select', 'select', 'private.can_view_school(private.trip_school(trip_id)) or private.is_trip_driver(trip_id) or (student_id is null and private.guardian_in_trip(trip_id)) or (student_id is not null and private.is_guardian_of(student_id))', null);
  perform private.pol('trip_events', 'trip_events_insert', 'insert', null, 'created_by = (select auth.uid()) and student_id is null and event_type in (''note'',''delay'',''emergency'') and ((private.is_trip_driver(trip_id) and private.trip_is_live(trip_id)) or private.is_school_staff(private.trip_school(trip_id)))');

  -- الإشعارات والأجهزة: للمالك فقط
  perform private.pol('notifications', 'notifications_select', 'select', 'user_id = (select auth.uid())', null);
  perform private.pol('notifications', 'notifications_update', 'update', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');
  perform private.pol('notification_preferences', 'notification_prefs_all', 'all', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');
  perform private.pol('device_tokens', 'device_tokens_all', 'all', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');

  -- الطوارئ
  perform private.pol('emergency_reports', 'emergency_select', 'select', 'private.can_view_school(school_id) or reported_by = (select auth.uid())', null);
  perform private.pol('emergency_reports', 'emergency_insert', 'insert', null, 'reported_by = (select auth.uid()) and status = ''open'' and resolved_by is null and private.user_in_school(school_id) and (trip_id is null or private.trip_school(trip_id) = school_id)');
  perform private.pol('emergency_reports', 'emergency_update', 'update', 'private.can_view_school(school_id) and not private.is_executive() or private.is_platform_admin()', 'private.can_view_school(school_id)');

  -- التقييمات والدعم: يُنشئها صاحبها باسمه فقط
  perform private.pol('ratings_feedback', 'feedback_select', 'select', 'author_user_id = (select auth.uid()) or private.can_view_school(school_id)', null);
  perform private.pol('ratings_feedback', 'feedback_insert', 'insert', null, 'author_user_id = (select auth.uid()) and status = ''new'' and private.user_in_school(school_id) and (student_id is null or private.is_guardian_of(student_id) or private.is_school_staff(school_id))');
  perform private.pol('ratings_feedback', 'feedback_update', 'update', 'private.is_school_staff(school_id)', 'private.is_school_staff(school_id)');

  perform private.pol('support_messages', 'support_select', 'select', 'user_id = (select auth.uid()) or (school_id is not null and private.can_view_school(school_id)) or private.is_platform_admin()', null);
  perform private.pol('support_messages', 'support_insert', 'insert', null, 'user_id = (select auth.uid()) and status = ''open'' and reply is null and replied_by is null and (school_id is null or private.user_in_school(school_id))');
  perform private.pol('support_messages', 'support_update', 'update', '(school_id is not null and private.is_school_staff(school_id)) or private.is_platform_admin()', '(school_id is not null and private.is_school_staff(school_id)) or private.is_platform_admin()');
  perform private.pol('support_messages', 'support_delete', 'delete', 'private.is_platform_admin()', null);

  -- الخطط: العامة يديرها مدير النظام، وخطط المدرسة تديرها إدارتها
  perform private.pol('subscription_plans', 'plans_select', 'select', '(school_id is null and private.is_active_user()) or (school_id is not null and private.user_in_school(school_id))', null);
  perform private.pol('subscription_plans', 'plans_insert', 'insert', null, '(school_id is null and private.is_platform_admin()) or (school_id is not null and private.is_school_staff(school_id))');
  perform private.pol('subscription_plans', 'plans_update', 'update', '(school_id is null and private.is_platform_admin()) or (school_id is not null and private.is_school_staff(school_id))', '(school_id is null and private.is_platform_admin()) or (school_id is not null and private.is_school_staff(school_id))');
  perform private.pol('subscription_plans', 'plans_delete', 'delete', '(school_id is null and private.is_platform_admin()) or (school_id is not null and private.is_school_staff(school_id))', null);

  -- سجل التدقيق: قراءة فقط
  perform private.pol('audit_logs', 'audit_select', 'select', 'private.is_executive() or (school_id is not null and private.is_school_admin(school_id))', null);
end $$;
-- أداة البناء لم تعد لازمة بعد إنشاء السياسات
drop function if exists private.pol(text, text, text, text, text);

-- ───────────────────────── Realtime ─────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['vehicle_locations','trip_events','trips','trip_stops','trip_students','notifications','emergency_reports'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ───────────────────────── Storage: صور الطلاب (خاص) ─────────────────────────
-- المسار: {school_id}/{student_id}/{file}
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('student-photos', 'student-photos', false)
      on conflict (id) do update set public = false;
    drop policy if exists masari_student_photos_read on storage.objects;
    create policy masari_student_photos_read on storage.objects for select to authenticated using (
      bucket_id = 'student-photos' and (
        private.can_view_school(((storage.foldername(name))[1])::uuid)
        or private.is_guardian_of(((storage.foldername(name))[2])::uuid)
        or private.driver_has_student(((storage.foldername(name))[2])::uuid)));
    drop policy if exists masari_student_photos_insert on storage.objects;
    create policy masari_student_photos_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'student-photos' and private.is_school_staff(((storage.foldername(name))[1])::uuid)
      and private.student_school(((storage.foldername(name))[2])::uuid) = ((storage.foldername(name))[1])::uuid);
    drop policy if exists masari_student_photos_update on storage.objects;
    create policy masari_student_photos_update on storage.objects for update to authenticated
      using (bucket_id = 'student-photos' and private.is_school_staff(((storage.foldername(name))[1])::uuid))
      with check (bucket_id = 'student-photos' and private.is_school_staff(((storage.foldername(name))[1])::uuid));
    drop policy if exists masari_student_photos_delete on storage.objects;
    create policy masari_student_photos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'student-photos' and private.is_school_staff(((storage.foldername(name))[1])::uuid));
  end if;
end $$;
