-- سائق بديل لرحلة واحدة، وفريق المدرسة بأدوار أدق: مشرف نقل (supervisor) وموظف بوابة (gate).
-- ملاحظة: توسيع قيد أدوار school_members في ملف 20261015000300 (يُشغَّل من SQL Editor).

-- ───────── أدوار المدرسة ─────────
create or replace function private.has_school_role(p_school uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or (private.is_active_user() and exists (
    select 1 from public.school_members m join public.schools s on s.id = m.school_id
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'
      and m.role = any(p_roles) and s.status = 'active'))
$$;
revoke execute on function private.has_school_role(uuid, text[]) from public, anon;
grant execute on function private.has_school_role(uuid, text[]) to authenticated;

-- مشرف النقل يدير التشغيل اليومي مثل «التشغيل»
create or replace function private.is_school_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or (private.is_active_user() and exists (
    select 1 from public.school_members m join public.schools s on s.id = m.school_id
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'
      and m.role in ('school_admin','operations','supervisor') and s.status = 'active'))
$$;

create or replace function public.school_add_member(p_school uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid;
begin
  if not private.is_school_admin(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_role not in ('school_admin','operations','supervisor','gate','control_tower') then raise exception 'INVALID_ROLE' using errcode = 'P0001'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  perform set_config('masari.trusted', 'on', true);
  insert into public.school_members(school_id, user_id, role, status, created_by)
    values (p_school, v_user, p_role, 'active', (select auth.uid()))
    on conflict (school_id, user_id) do update set role = excluded.role, status = 'active'
    returning id into v_id;
  update public.profiles set status = 'active' where user_id = v_user and status = 'pending';
  perform private.audit(p_school, 'member_added', 'school_members', v_id::text, null, jsonb_build_object('role', p_role));
  return v_id;
end $$;

-- إيقاف عضو أو إعادة تفعيله (بدل الحذف)
create or replace function public.school_set_member_status(p_member uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.school_members;
begin
  select * into m from public.school_members where id = p_member;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_admin(m.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if m.user_id = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if p_status not in ('active','suspended') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.school_members set status = p_status where id = p_member;
  perform private.audit(m.school_id, 'member_status', 'school_members', p_member::text, null, jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.school_set_member_status(uuid, text) from public, anon;
grant execute on function public.school_set_member_status(uuid, text) to authenticated;

create or replace function public.school_team(p_school uuid)
returns table (id uuid, user_id uuid, email text, full_name text, role text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_school_admin(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query select m.id, m.user_id, u.email::text, p.full_name, m.role, m.status, m.created_at
    from public.school_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.user_id = m.user_id
    where m.school_id = p_school order by m.created_at;
end $$;
revoke execute on function public.school_team(uuid) from public, anon;
grant execute on function public.school_team(uuid) to authenticated;

-- موظف البوابة يسلّم الطلاب في «نداء البوابة»
create or replace function public.update_pickup_call(p_call uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.pickup_calls; v_name text;
begin
  select * into c from public.pickup_calls where id = p_call for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if c.status <> 'waiting' then raise exception 'ALREADY_CLOSED' using errcode = 'P0001'; end if;
  if p_status = 'released' then
    if not (private.is_school_staff(c.school_id) or private.has_school_role(c.school_id, array['gate'])) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    select full_name into v_name from public.students where id = c.student_id;
    update public.pickup_calls set status = 'released', released_by = (select auth.uid()), released_at = now() where id = p_call;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (c.created_by, c.school_id, 'pickup_released', v_name || ' في الطريق إليك', 'سلّمت المدرسة ' || v_name || ' عند البوابة.',
            jsonb_build_object('call_id', p_call), 'pickup_released:' || p_call)
    on conflict (user_id, dedupe_key) do nothing;
  elsif p_status = 'cancelled' then
    if c.created_by <> (select auth.uid()) and not private.is_school_staff(c.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    update public.pickup_calls set status = 'cancelled' where id = p_call;
  else
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
end $$;

-- ───────── السائق البديل ─────────
-- السائق المسند لرحلة (ولو بديلًا ليوم واحد) يرى مسارها ومحطاتها وطلابها وباصها
create policy routes_trip_driver_select on public.routes for select to authenticated
  using (exists (select 1 from public.trips t where t.route_id = routes.id and t.driver_id = private.my_driver_id()
                 and t.trip_date >= private.riyadh_today() - 1));
create policy sra_trip_driver_select on public.student_route_assignments for select to authenticated
  using (exists (select 1 from public.trips t where t.route_id = student_route_assignments.route_id and t.driver_id = private.my_driver_id()
                 and t.trip_date >= private.riyadh_today() - 1));
create policy buses_trip_driver_select on public.buses for select to authenticated
  using (exists (select 1 from public.trips t where t.bus_id = buses.id and t.driver_id = private.my_driver_id()
                 and t.trip_date >= private.riyadh_today() - 1));

-- تغيير سائق الرحلة يُبلغ السائق البديل
create or replace function private.notify_trip_driver_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_route text;
begin
  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    if new.status not in ('scheduled','ready') then raise exception 'TRIP_ALREADY_STARTED' using errcode = 'P0001'; end if;
    select user_id into v_user from public.drivers where id = new.driver_id;
    select name into v_route from public.routes where id = new.route_id;
    if v_user is not null then
      insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
      values (v_user, new.school_id, 'substitute_driver', 'رحلة مسندة إليك اليوم',
              'أُسندت إليك رحلة ' || coalesce(v_route, '') || ' بتاريخ ' || to_char(new.trip_date, 'YYYY-MM-DD') || ' بدلًا من السائق الأساسي.',
              jsonb_build_object('trip_id', new.id), 'sub:' || new.id || ':' || new.driver_id)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    perform private.audit(new.school_id, 'trip_driver_changed', 'trips', new.id::text, jsonb_build_object('driver_id', old.driver_id), jsonb_build_object('driver_id', new.driver_id));
  end if;
  return new;
end $$;
create or replace trigger trips_driver_change after update of driver_id on public.trips
  for each row execute function private.notify_trip_driver_change();
