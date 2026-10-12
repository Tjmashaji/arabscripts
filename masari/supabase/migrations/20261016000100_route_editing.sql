-- تعديل المسارات وحذفها من حساب المدرسة.
-- الحذف لمدير/مديرة المدرسة فقط، ولا يُحذف مسار له رحلات سابقة (حفاظًا على السجل والتقارير) بل يُؤرشف.

alter table public.routes add column if not exists archived_at timestamptz;

-- حارس الحذف في 20261016000200_route_delete_guard.sql (يُشغَّل من SQL Editor).

-- أرشفة مسار له سجل رحلات (أو إعادته): يوقفه ويلغي رحلاته القادمة غير المبدوءة ويُبلغ أولياء الأمور
create or replace function public.school_archive_route(p_route uuid, p_archive boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.routes; n int := 0;
begin
  select * into r from public.routes where id = p_route for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_admin(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_archive and exists (select 1 from public.trips where route_id = p_route and status in ('in_progress','paused','emergency')) then
    raise exception 'TRIP_IN_PROGRESS' using errcode = 'P0001';
  end if;
  update public.routes set archived_at = case when p_archive then now() end, is_active = not p_archive where id = p_route;
  if p_archive then
    update public.trips set status = 'cancelled' where route_id = p_route and status in ('scheduled','ready') and trip_date >= private.riyadh_today();
    get diagnostics n = row_count;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select distinct g.user_id, r.school_id, 'route_archived', 'تغيير في مسار النقل',
           'أوقفت المدرسة مسار «' || r.name || '». ستبلغك المدرسة بالمسار الجديد لابنك.', jsonb_build_object('route_id', p_route), 'route_arch:' || p_route || ':' || to_char(now(), 'YYMMDDHH24MI')
    from public.student_route_assignments a join public.guardian_students gs on gs.student_id = a.student_id
    join public.guardians g on g.id = gs.guardian_id and g.user_id is not null and g.status = 'active'
    where a.route_id = p_route and a.status = 'active'
    on conflict (user_id, dedupe_key) do nothing;
    update public.student_route_assignments set status = 'inactive' where route_id = p_route and status = 'active';
  end if;
  perform private.audit(r.school_id, case when p_archive then 'route_archived' else 'route_restored' end, 'routes', p_route::text, null, null);
  return n;
end $$;
revoke execute on function public.school_archive_route(uuid, boolean) from public, anon;
grant execute on function public.school_archive_route(uuid, boolean) to authenticated;

-- إعادة ترتيب المحطات (القيد مؤجل حتى نهاية المعاملة فيمكن التبديل مباشرة)
create or replace function public.school_reorder_stops(p_route uuid, p_stops uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.routes; i int;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (select count(*) from public.route_stops where route_id = p_route) <> coalesce(array_length(p_stops, 1), 0)
     or exists (select 1 from unnest(p_stops) s where not exists (select 1 from public.route_stops x where x.id = s and x.route_id = p_route)) then
    raise exception 'INVALID_STOPS' using errcode = 'P0001';
  end if;
  for i in 1 .. array_length(p_stops, 1) loop
    update public.route_stops set stop_order = i where id = p_stops[i];
  end loop;
end $$;
revoke execute on function public.school_reorder_stops(uuid, uuid[]) from public, anon;
grant execute on function public.school_reorder_stops(uuid, uuid[]) to authenticated;

-- إنشاء مسار العودة من مسار الذهاب (المحطات بالعكس، ونفس الطلاب ومحطاتهم)
create or replace function public.school_create_return_route(p_route uuid, p_time time) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.routes; v_new uuid; s record; v_stop uuid; v_n int; v_name text;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.direction <> 'to_school' then raise exception 'NOT_TO_SCHOOL' using errcode = 'P0001'; end if;
  v_name := r.name || ' (عودة)';
  if exists (select 1 from public.routes where school_id = r.school_id and name = v_name and direction = 'to_home') then raise exception 'RETURN_EXISTS' using errcode = 'P0001'; end if;
  insert into public.routes (school_id, name, direction, scheduled_time, estimated_duration_minutes, bus_id, driver_id, is_active)
    values (r.school_id, v_name, 'to_home', p_time, r.estimated_duration_minutes, r.bus_id, r.driver_id, true) returning id into v_new;
  select count(*) into v_n from public.route_stops where route_id = p_route;
  for s in select * from public.route_stops where route_id = p_route order by stop_order desc loop
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude)
      values (v_new, v_n - s.stop_order + 1, s.label, case when s.stop_type = 'pickup' then 'dropoff' else s.stop_type end, s.latitude, s.longitude)
      returning id into v_stop;
    insert into public.student_route_assignments (student_id, route_id, stop_id)
      select a.student_id, v_new, v_stop from public.student_route_assignments a where a.route_id = p_route and a.stop_id = s.id and a.status = 'active'
      on conflict (student_id, route_id) do nothing;
  end loop;
  return v_new;
end $$;
revoke execute on function public.school_create_return_route(uuid, time) from public, anon;
grant execute on function public.school_create_return_route(uuid, time) to authenticated;
