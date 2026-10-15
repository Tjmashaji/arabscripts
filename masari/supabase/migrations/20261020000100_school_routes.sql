-- المدرسة: أكثر من مسار للباص والسائق في اليوم (فترتان صباحيتان مثلًا) بشرط ألا تتداخل الأوقات،
-- وحفظ المسارات المقترحة وأوقات المحطات في عملية واحدة، وإسناد عدة طلاب لمسار دفعة واحدة.

-- ═════════ أكثر من رحلة في اليوم للباص والسائق ═════════
-- كان القيدان يمنعان رحلة ثانية بنفس الاتجاه في اليوم. التشغيل المتزامن ما زال ممنوعًا بـ trips_one_active_per_driver/bus،
-- والتداخل في الجدول يمنعه حارس المسارات أدناه.
drop index if exists public.trips_driver_day;
drop index if exists public.trips_bus_day;

-- دقائق منذ منتصف الليل
create or replace function private.minutes_of(p_time time) returns int
language sql immutable set search_path = '' as $$ select (extract(hour from p_time) * 60 + extract(minute from p_time))::int $$;

-- لا يُسند باص أو سائق لمسارين نشطين تتداخل أوقاتهما في يوم مشترك
create or replace function private.check_route_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o record; v_start int; v_end int; v_days smallint[] := coalesce(new.days, '{0,1,2,3,4}'::smallint[]);
begin
  if not new.is_active or new.archived_at is not null or new.scheduled_time is null or (new.bus_id is null and new.driver_id is null) then return new; end if;
  if tg_op = 'UPDATE' and (new.bus_id, new.driver_id, new.scheduled_time, new.estimated_duration_minutes, new.days, new.is_active, new.archived_at)
     is not distinct from (old.bus_id, old.driver_id, old.scheduled_time, old.estimated_duration_minutes, old.days, old.is_active, old.archived_at) then
    return new;
  end if;
  v_start := private.minutes_of(new.scheduled_time);
  v_end := v_start + coalesce(new.estimated_duration_minutes, 45);
  select r.name, (r.bus_id = new.bus_id) as same_bus into o from public.routes r
   where r.id <> new.id and r.school_id = new.school_id and r.is_active and r.archived_at is null and r.scheduled_time is not null
     and (r.bus_id = new.bus_id or r.driver_id = new.driver_id)
     and coalesce(r.days, '{0,1,2,3,4}'::smallint[]) && v_days
     and private.minutes_of(r.scheduled_time) < v_end
     and v_start < private.minutes_of(r.scheduled_time) + coalesce(r.estimated_duration_minutes, 45)
   order by r.scheduled_time limit 1;
  if found then
    raise exception '%', case when o.same_bus then 'BUS_SCHEDULE_OVERLAP' else 'DRIVER_SCHEDULE_OVERLAP' end
      using errcode = 'P0001', detail = o.name;
  end if;
  return new;
end $$;
create or replace trigger routes_schedule_check
  before insert or update on public.routes
  for each row execute function private.check_route_schedule();

-- ═════════ اقتراح المسارات: إنشاء كل شيء أو لا شيء ═════════
-- p_routes: [{name, direction, time, minutes, stops: [{label, type, lat, lng, students: [uuid]}]}] بترتيب المحطات
create or replace function public.school_create_planned_routes(p_school uuid, p_routes jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; s jsonb; st text; v_route uuid; v_stop uuid; v_order int; n int := 0;
begin
  if not private.is_school_staff(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_routes) <> 'array' or jsonb_array_length(p_routes) = 0 or jsonb_array_length(p_routes) > 60 then
    raise exception 'INVALID_PLAN' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_routes) loop
    if coalesce(r->>'direction', '') not in ('to_school','to_home') or jsonb_array_length(coalesce(r->'stops', '[]')) < 2 then
      raise exception 'INVALID_PLAN' using errcode = '22023';
    end if;
    insert into public.routes (school_id, name, direction, scheduled_time, estimated_duration_minutes)
      values (p_school, left(btrim(r->>'name'), 120), r->>'direction', nullif(r->>'time', '')::time, greatest(coalesce((r->>'minutes')::int, 30), 5))
      returning id into v_route;
    v_order := 0;
    for s in select * from jsonb_array_elements(r->'stops') loop
      v_order := v_order + 1;
      insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude)
        values (v_route, v_order, left(btrim(s->>'label'), 120), coalesce(s->>'type', 'pickup'),
                round((s->>'lat')::numeric, 6), round((s->>'lng')::numeric, 6))
        returning id into v_stop;
      for st in select * from jsonb_array_elements_text(coalesce(s->'students', '[]')) loop
        insert into public.student_route_assignments (student_id, route_id, stop_id) values (st::uuid, v_route, v_stop)
          on conflict (student_id, route_id) do update set stop_id = excluded.stop_id, status = 'active';
      end loop;
    end loop;
    n := n + 1;
  end loop;
  perform private.audit(p_school, 'routes_planned', 'routes', null, null, jsonb_build_object('routes', n));
  return n;
end $$;

-- ═════════ أوقات المحطات المتوقعة دفعة واحدة ═════════
create or replace function public.school_set_stop_times(p_route uuid, p_times time[], p_minutes int) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.routes; v_ids uuid[];
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select array_agg(id order by stop_order) into v_ids from public.route_stops where route_id = p_route;
  if coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(p_times, 1), 0) then raise exception 'INVALID_STOPS' using errcode = 'P0001'; end if;
  update public.route_stops s set scheduled_time = t.tm
    from unnest(v_ids, p_times) as t(id, tm) where s.id = t.id;
  update public.routes set estimated_duration_minutes = greatest(coalesce(p_minutes, 5), 5) where id = p_route;
end $$;

-- ═════════ إسناد عدة طلاب لمسار ═════════
-- p_stop فارغ: كل طالب لأقرب محطة لمنزله (أو أول محطة إن لم يُحدد منزله). السعة يفرضها حارس الإسناد، والخطأ يلغي الكل.
create or replace function public.school_bulk_assign(p_route uuid, p_students uuid[], p_stop uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.routes; st record; v_stop uuid; n int := 0;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not r.is_active or r.archived_at is not null then raise exception 'ROUTE_INACTIVE' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_students, 1), 0) = 0 or array_length(p_students, 1) > 500 then raise exception 'INVALID_STUDENTS' using errcode = '22023'; end if;
  if p_stop is not null and not exists (select 1 from public.route_stops where id = p_stop and route_id = p_route and stop_type <> 'school') then
    raise exception 'STOP_NOT_IN_ROUTE' using errcode = 'P0001';
  end if;
  for st in select s.id, s.home_latitude, s.home_longitude from public.students s
            where s.id = any(p_students) and s.school_id = r.school_id order by s.full_name loop
    v_stop := p_stop;
    if v_stop is null then
      select x.id into v_stop from public.route_stops x where x.route_id = p_route and x.stop_type <> 'school'
        order by case when st.home_latitude is null or x.latitude is null then 1 else 0 end,
                 power(x.latitude - st.home_latitude, 2) + power((x.longitude - st.home_longitude) * cos(radians(st.home_latitude)), 2) nulls last,
                 x.stop_order
        limit 1;
      if v_stop is null then raise exception 'NO_STOPS' using errcode = 'P0001'; end if;
    end if;
    insert into public.student_route_assignments (student_id, route_id, stop_id) values (st.id, p_route, v_stop)
      on conflict (student_id, route_id) do update set stop_id = excluded.stop_id, status = 'active';
    n := n + 1;
  end loop;
  perform private.audit(r.school_id, 'bulk_assign', 'routes', p_route::text, null, jsonb_build_object('students', n, 'stop', p_stop));
  return n;
end $$;

revoke execute on function public.school_create_planned_routes(uuid, jsonb), public.school_set_stop_times(uuid, time[], int), public.school_bulk_assign(uuid, uuid[], uuid) from public, anon;
grant execute on function public.school_create_planned_routes(uuid, jsonb), public.school_set_stop_times(uuid, time[], int), public.school_bulk_assign(uuid, uuid[], uuid) to authenticated;
