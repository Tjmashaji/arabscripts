-- المدرسة: إنشاء رحلات اليوم تلقائيًا كل صباح، واستيراد الطلاب واعتماد طلباتهم دفعة واحدة.

-- ========== رحلات اليوم ==========
alter table public.schools add column if not exists auto_daily_trips boolean not null default true;

-- نفس شروط شاشة «رحلات اليوم»: يعيد سبب عدم الجاهزية أو null
create or replace function private.route_not_ready(p_route uuid, p_date date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r public.routes;
begin
  select * into r from public.routes where id = p_route;
  if not found or not r.is_active or r.archived_at is not null then return 'ROUTE_INACTIVE'; end if;
  if not (extract(dow from p_date)::smallint = any(coalesce(r.days, '{0,1,2,3,4}'::smallint[]))) then return 'NOT_RUNNING_TODAY'; end if;
  if r.driver_id is null then return 'NO_DRIVER'; end if;
  if r.bus_id is null then return 'NO_BUS'; end if;
  if (select count(*) from public.route_stops s where s.route_id = p_route) < 2 then return 'NOT_ENOUGH_STOPS'; end if;
  if exists (select 1 from public.route_stops s where s.route_id = p_route and (s.latitude is null or s.longitude is null)) then
    return 'STOP_HAS_NO_LOCATION';
  end if;
  if not exists (select 1 from public.student_route_assignments a where a.route_id = p_route and a.status = 'active') then
    return 'NO_STUDENTS';
  end if;
  return private.trip_blocker(r.school_id, r.bus_id, r.driver_id, p_date);
end $$;

-- ينشئ رحلات الجاهز من المسارات. المسار الذي له رحلة في اليوم نفسه لا يُلمس، حتى لو أُلغيت (الإلغاء قرار المدرسة).
create or replace function private.create_trips_for(p_school uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_reason text; v_created int := 0; v_skipped jsonb := '[]'::jsonb;
begin
  for r in select * from public.routes where school_id = p_school and is_active and archived_at is null order by scheduled_time nulls last, name loop
    if exists (select 1 from public.trips t where t.route_id = r.id and t.trip_date = p_date and t.direction = r.direction) then continue; end if;
    v_reason := private.route_not_ready(r.id, p_date);
    if v_reason is null then
      begin
        insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status, trip_date)
          values (p_school, r.id, r.bus_id, r.driver_id, r.direction, 'scheduled', p_date);
        v_created := v_created + 1;
      exception
        when unique_violation then v_reason := 'DRIVER_OR_BUS_BUSY';
        when others then v_reason := sqlerrm;
      end;
    end if;
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('route_id', r.id, 'route', r.name, 'reason', v_reason));
    end if;
  end loop;
  return jsonb_build_object('date', p_date, 'created', v_created, 'skipped', v_skipped);
end $$;

-- زر «إنشاء رحلات اليوم» في شاشة المدرسة
create or replace function public.create_today_trips(p_school uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_school_staff(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  v := private.create_trips_for(p_school, private.riyadh_today());
  if (v->>'created')::int > 0 then
    perform private.audit(p_school, 'create_today_trips', 'trips', null, null, v);
  end if;
  return v;
end $$;
grant execute on function public.create_today_trips(uuid) to authenticated;

create or replace function public.set_auto_daily_trips(p_school uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_school_role(p_school, array['school_admin','operations']) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.schools set auto_daily_trips = coalesce(p_on, true) where id = p_school;
  perform private.audit(p_school, 'auto_daily_trips', 'schools', p_school::text, null, jsonb_build_object('on', p_on));
end $$;
grant execute on function public.set_auto_daily_trips(uuid, boolean) to authenticated;

-- كل صباح (٤:٣٠ بتوقيت الرياض): رحلات اليوم لكل مدرسة مفعّلة، وملخص لفريق المدرسة بما أُنشئ وما تعذّر
create or replace function private.daily_trips() returns int
language plpgsql security definer set search_path = '' as $$
declare s record; v jsonb; v_day date := private.riyadh_today(); v_total int := 0; v_problems int; v_body text;
begin
  for s in select id from public.schools where status = 'active' and auto_daily_trips loop
    begin
      v := private.create_trips_for(s.id, v_day);
    exception when others then
      continue; -- مدرسة واحدة لا توقف البقية
    end;
    v_total := v_total + (v->>'created')::int;
    select count(*) into v_problems from jsonb_array_elements(v->'skipped') e
      where e->>'reason' not in ('NOT_RUNNING_TODAY','SCHOOL_HOLIDAY');
    if (v->>'created')::int = 0 and v_problems = 0 then continue; end if; -- عطلة أو لا مسارات اليوم
    v_body := 'أُنشئت ' || (v->>'created') || ' رحلة';
    if v_problems > 0 then v_body := v_body || '، وتعذّر إنشاء ' || v_problems || ' (راجع «رحلات اليوم»)'; end if;
    perform private.notify_school_staff(s.id, case when v_problems > 0 then 'daily_trips_issues' else 'daily_trips' end,
      'رحلات اليوم', v_body, 'daily_trips:' || s.id || ':' || v_day, v);
  end loop;
  return v_total;
end $$;
revoke execute on function private.daily_trips() from public;

select cron.schedule('masari-daily-trips', '30 1 * * *', $$select private.daily_trips()$$);

-- ========== استيراد الطلاب ==========
-- p_rows: [{name, grade, class_name, parent_name, parent_phone, parent_email, home_address, lat, lng,
--           national_id, emergency_name, emergency_phone}]
-- كل صف يمر بنفس مسار اعتماد طلب التسجيل (ولي الأمر يُربط بالبريد)، والصف الخاطئ لا يوقف البقية.
create or replace function public.import_students(p_school uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb; i int := 0; v_req uuid; v_student uuid; v_name text; v_email text; v_lat numeric; v_lng numeric;
  v_created int := 0; v_errors jsonb := '[]'::jsonb;
begin
  if not private.is_school_staff(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'BAD_ROWS' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'TOO_MANY_ROWS' using errcode = '22023'; end if;

  for e in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_name := btrim(coalesce(e->>'name', ''));
    begin
      if char_length(v_name) < 3 then raise exception 'NAME_REQUIRED'; end if;
      v_email := nullif(lower(btrim(coalesce(e->>'parent_email', ''))), '');
      if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL'; end if;
      v_lat := nullif(btrim(coalesce(e->>'lat', '')), '')::numeric;
      v_lng := nullif(btrim(coalesce(e->>'lng', '')), '')::numeric;
      if (v_lat is null) <> (v_lng is null) or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'INVALID_LOCATION';
      end if;

      insert into public.student_onboarding_requests (school_id, created_by, student_name, grade, parent_name, parent_phone,
          parent_email, home_address, home_latitude, home_longitude, student_national_id, status)
        values (p_school, (select auth.uid()), v_name, nullif(btrim(e->>'grade'), ''), nullif(btrim(e->>'parent_name'), ''),
          nullif(btrim(e->>'parent_phone'), ''), v_email, nullif(btrim(e->>'home_address'), ''), v_lat, v_lng,
          nullif(btrim(e->>'national_id'), ''), 'pending')
        returning id into v_req;
      v_student := public.review_student_request(v_req, true, 'استيراد جماعي');
      update public.students set
          class_name = coalesce(nullif(btrim(e->>'class_name'), ''), class_name),
          emergency_contact_name = coalesce(nullif(btrim(e->>'emergency_name'), ''), emergency_contact_name),
          emergency_contact_phone = coalesce(nullif(btrim(e->>'emergency_phone'), ''), emergency_contact_phone)
        where id = v_student;
      v_created := v_created + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', i, 'name', v_name,
        'error', case when sqlerrm ~ '^[A-Z_]+$' then sqlerrm when sqlstate = '22P02' then 'INVALID_LOCATION' else 'INVALID_ROW' end));
    end;
  end loop;

  perform private.audit(p_school, 'import_students', 'students', null, null,
    jsonb_build_object('rows', i, 'created', v_created, 'failed', jsonb_array_length(v_errors)));
  return jsonb_build_object('created', v_created, 'errors', v_errors);
end $$;
grant execute on function public.import_students(uuid, jsonb) to authenticated;

-- اعتماد عدة طلبات تسجيل مرة واحدة؛ كل طلب مستقل، والفاشل يُعاد مع سببه
create or replace function public.approve_student_requests(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ok int := 0; v_errors jsonb := '[]'::jsonb;
begin
  if coalesce(array_length(p_ids, 1), 0) > 500 then raise exception 'TOO_MANY_ROWS' using errcode = '22023'; end if;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    begin
      perform public.review_student_request(v_id, true, null);
      v_ok := v_ok + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('id', v_id, 'error', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('approved', v_ok, 'errors', v_errors);
end $$;
grant execute on function public.approve_student_requests(uuid[]) to authenticated;
