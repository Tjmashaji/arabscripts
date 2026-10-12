-- أدوات المسارات: أيام التشغيل، نسخ المسار، وإشعار ولي الأمر عند أي تغيير يخص ابنه.

-- أيام التشغيل (0 = الأحد … 6 = السبت). الافتراضي أيام الدراسة من الأحد إلى الخميس.
alter table public.routes add column if not exists days smallint[] not null default '{0,1,2,3,4}';

create or replace function public.school_copy_route(p_route uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.routes; v_new uuid;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_name)), 0) < 2 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.routes (school_id, name, direction, scheduled_time, estimated_duration_minutes, days, is_active)
    values (r.school_id, btrim(p_name), r.direction, r.scheduled_time, r.estimated_duration_minutes, r.days, true) returning id into v_new;
  insert into public.route_stops (route_id, stop_order, label, stop_type, scheduled_time, latitude, longitude, radius_m)
    select v_new, stop_order, label, stop_type, scheduled_time, latitude, longitude, radius_m from public.route_stops where route_id = p_route;
  return v_new;
end $$;
revoke execute on function public.school_copy_route(uuid, text) from public, anon;
grant execute on function public.school_copy_route(uuid, text) to authenticated;

-- إشعار أولياء الأمور بالتغيير (رسالة واحدة لكل ولي أمر لكل مسار خلال 10 دقائق مهما تعددت التعديلات)
create or replace function private.notify_route_change(p_route uuid, p_students uuid[], p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.routes;
begin
  select * into r from public.routes where id = p_route;
  if not found or not r.is_active or r.archived_at is not null then return; end if;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select distinct g.user_id, r.school_id, 'route_changed', 'تحديث في مسار ' || r.name, p_body,
         jsonb_build_object('route_id', p_route), 'route_chg:' || p_route || ':' || to_char(date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes', 'YYMMDDHH24MI')
  from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id and g.user_id is not null and g.status = 'active'
  where gs.student_id = any(p_students)
  on conflict (user_id, dedupe_key) do nothing;
end $$;
revoke execute on function private.notify_route_change(uuid, uuid[], text) from public, anon, authenticated;

create or replace function private.on_route_stop_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_students uuid[];
begin
  if new.latitude is not distinct from old.latitude and new.longitude is not distinct from old.longitude
     and new.scheduled_time is not distinct from old.scheduled_time then return new; end if;
  select array_agg(student_id) into v_students from public.student_route_assignments where stop_id = new.id and status = 'active';
  if v_students is not null then
    perform private.notify_route_change(new.route_id, v_students,
      'محطة «' || new.label || '»' || case when new.scheduled_time is distinct from old.scheduled_time and new.scheduled_time is not null then ': الموعد المتوقع ' || to_char(new.scheduled_time, 'HH24:MI') else '' end
      || case when new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude then ' · تغيّر موقع المحطة، راجعه على الخريطة.' else '.' end);
  end if;
  return new;
end $$;
create or replace trigger route_stops_notify_change after update of latitude, longitude, scheduled_time on public.route_stops
  for each row execute function private.on_route_stop_change();

create or replace function private.on_route_time_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_students uuid[];
begin
  if new.scheduled_time is not distinct from old.scheduled_time and new.days is not distinct from old.days then return new; end if;
  select array_agg(student_id) into v_students from public.student_route_assignments where route_id = new.id and status = 'active';
  if v_students is not null then
    perform private.notify_route_change(new.id, v_students,
      'موعد الانطلاق ' || coalesce(to_char(new.scheduled_time, 'HH24:MI'), '—') || case when new.days is distinct from old.days then ' · تغيّرت أيام التشغيل.' else '.' end);
  end if;
  return new;
end $$;
create or replace trigger routes_notify_time_change after update of scheduled_time, days on public.routes
  for each row execute function private.on_route_time_change();

create or replace function private.on_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stop text;
begin
  if tg_op = 'UPDATE' and new.stop_id is not distinct from old.stop_id and new.route_id is not distinct from old.route_id and new.status is not distinct from old.status then return new; end if;
  if new.status <> 'active' then return new; end if;
  select label into v_stop from public.route_stops where id = new.stop_id;
  perform private.notify_route_change(new.route_id, array[new.student_id], 'محطة ابنك الآن: ' || coalesce(v_stop, 'تحددها المدرسة') || '.');
  return new;
end $$;
create or replace trigger sra_notify_change after insert or update on public.student_route_assignments
  for each row execute function private.on_assignment_change();
