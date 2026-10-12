-- السلامة: فحص الباص قبل أول رحلة في اليوم، وتنبيه «طالب لم ينزل»، وتنبيه تأخر بدء الرحلة.

-- ───────── فحص الباص اليومي ─────────
create table if not exists public.vehicle_checks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  check_date date not null default ((now() at time zone 'Asia/Riyadh')::date),
  items jsonb not null default '{}'::jsonb,
  all_ok boolean not null default true,
  notes text check (notes is null or length(notes) <= 500),
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_checks_bus_day on public.vehicle_checks (bus_id, check_date);
create index if not exists vehicle_checks_school_day on public.vehicle_checks (school_id, check_date);
create index if not exists vehicle_checks_driver on public.vehicle_checks (driver_id);
create index if not exists vehicle_checks_trip on public.vehicle_checks (trip_id);
alter table public.vehicle_checks enable row level security;
create policy vehicle_checks_select on public.vehicle_checks for select to authenticated
  using (private.can_view_school(school_id) or driver_id = private.my_driver_id());
grant select on public.vehicle_checks to authenticated;

-- السائق يسجّل الفحص لرحلته؛ النظام يحدد المدرسة والباص ويبلّغ المدرسة إن وُجدت ملاحظة
create or replace function public.submit_vehicle_check(p_trip uuid, p_items jsonb, p_notes text default null, p_photo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_id uuid; v_ok boolean; v_bad text; v_bus text;
begin
  select * into t from public.trips where id = p_trip;
  if not found or not private.is_trip_driver(p_trip) then raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501'; end if;
  if t.bus_id is null then raise exception 'NO_BUS' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'object' then raise exception 'INVALID_ITEMS' using errcode = 'P0001'; end if;
  select coalesce(bool_and(value::text = 'true'), true), string_agg(key, '، ') filter (where value::text <> 'true')
    into v_ok, v_bad from jsonb_each(p_items);
  insert into public.vehicle_checks (school_id, bus_id, driver_id, trip_id, items, all_ok, notes, photo_path)
    values (t.school_id, t.bus_id, private.my_driver_id(), p_trip, p_items, v_ok, nullif(btrim(p_notes), ''), nullif(btrim(p_photo), ''))
    returning id into v_id;
  if not v_ok then
    select bus_number into v_bus from public.buses where id = t.bus_id;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, t.school_id, 'vehicle_check_issue', 'ملاحظة في فحص الباص ' || coalesce(v_bus, ''),
           'بنود غير سليمة: ' || coalesce(v_bad, '') || coalesce(' · ' || nullif(btrim(p_notes), ''), ''),
           jsonb_build_object('check_id', v_id, 'trip_id', p_trip), 'vcheck:' || v_id
    from public.school_members m
    where m.school_id = t.school_id and m.status = 'active' and m.role in ('school_admin','operations')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return v_id;
end $$;
revoke execute on function public.submit_vehicle_check(uuid, jsonb, text, text) from public, anon;
grant execute on function public.submit_vehicle_check(uuid, jsonb, text, text) to authenticated;

-- لا تبدأ رحلة بباص لم يُفحص اليوم
create or replace function private.require_vehicle_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'in_progress' and old.status in ('scheduled','ready') and new.bus_id is not null
     and not exists (select 1 from public.vehicle_checks c where c.bus_id = new.bus_id and c.check_date = new.trip_date) then
    raise exception 'VEHICLE_CHECK_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger trips_require_vehicle_check before update of status on public.trips
  for each row execute function private.require_vehicle_check();

-- صور الفحص: مجلد <school>/<trip>/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-checks', 'vehicle-checks', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy masari_vehicle_checks_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-checks' and private.is_trip_driver(((storage.foldername(name))[2])::uuid));
create policy masari_vehicle_checks_read on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-checks' and (private.can_view_school(((storage.foldername(name))[1])::uuid)
         or private.is_trip_driver(((storage.foldername(name))[2])::uuid)));

-- ───────── «طالب لم ينزل»: إنهاء الرحلة يُرفض ويُبلَّغ برج المراقبة والمدرسة فورًا ─────────
create or replace function public.complete_trip(p_trip uuid, p_bus_checked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_on_bus int; v_pending int; v_names text; v_bus text;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not private.is_trip_driver(p_trip) then raise exception 'TRIP_NOT_ASSIGNED' using errcode = '42501'; end if;
  if t.status not in ('in_progress','paused') then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if not coalesce(p_bus_checked, false) then raise exception 'BUS_CHECK_REQUIRED' using errcode = 'P0001'; end if;
  select count(*) into v_pending from public.trip_stops where trip_id = p_trip and status = 'pending';
  if v_pending > 0 then
    raise exception 'STOPS_NOT_PROCESSED' using errcode = 'P0001', detail = jsonb_build_object('pending', v_pending)::text;
  end if;
  select count(*), string_agg(s.full_name, '، ') into v_on_bus, v_names
    from public.trip_students ts join public.students s on s.id = ts.student_id
    where ts.trip_id = p_trip and ts.status in ('boarded','boarded_return');
  if v_on_bus > 0 then
    select bus_number into v_bus from public.buses where id = t.bus_id;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, t.school_id, 'child_on_bus', '⚠️ طالب لم يُسجَّل نزوله — الباص ' || coalesce(v_bus, ''),
           'حاول السائق إنهاء الرحلة وما زال في الباص: ' || v_names || '. تواصل مع السائق فورًا.',
           jsonb_build_object('trip_id', p_trip), 'child_on_bus:' || p_trip || ':' || to_char(now(), 'HH24MI')
    from public.school_members m
    where m.school_id = t.school_id and m.status = 'active'
    on conflict (user_id, dedupe_key) do nothing;
    insert into public.trip_events(trip_id, event_type, note) values (p_trip, 'emergency', 'محاولة إنهاء الرحلة وفي الباص: ' || v_names);
    return jsonb_build_object('completed', false, 'reason', 'STUDENTS_STILL_ON_BUS', 'count', v_on_bus, 'names', v_names);
  end if;

  update public.trips set status = 'completed', completed_at = now() where id = p_trip;
  insert into public.trip_events(trip_id, event_type, note) values (p_trip, 'trip_completed', 'انتهت الرحلة بعد تأكيد السائق خلو الباص');
  perform private.audit(t.school_id, 'trip_completed', 'trips', p_trip::text, null, jsonb_build_object('bus_checked', true));
  return jsonb_build_object('completed', true, 'trip_id', p_trip,
    'duration_minutes', round(extract(epoch from (now() - t.started_at)) / 60),
    'stops', (select count(*) from public.trip_stops where trip_id = p_trip),
    'students', (select count(*) from public.trip_students where trip_id = p_trip));
end $$;

-- ───────── تأخر بدء الرحلة 10 دقائق ─────────
create or replace function private.check_late_trips() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select t.id, t.school_id, t.route_id, ro.name as route_name, ro.scheduled_time
    from public.trips t join public.routes ro on ro.id = t.route_id
    where t.trip_date = private.riyadh_today() and t.status in ('scheduled','ready') and ro.scheduled_time is not null
      and (t.trip_date + ro.scheduled_time) < ((now() at time zone 'Asia/Riyadh') - interval '10 minutes')
      and (t.trip_date + ro.scheduled_time) > ((now() at time zone 'Asia/Riyadh') - interval '3 hours')
  loop
    -- المدرسة
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, r.school_id, 'trip_late', 'تأخر بدء رحلة ' || r.route_name,
           'موعدها ' || to_char(r.scheduled_time, 'HH24:MI') || ' ولم تبدأ بعد.', jsonb_build_object('trip_id', r.id), 'late:' || r.id
    from public.school_members m where m.school_id = r.school_id and m.status = 'active'
    on conflict (user_id, dedupe_key) do nothing;
    -- أولياء الأمور
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select distinct g.user_id, r.school_id, 'trip_late', 'تأخر الباص',
           'رحلة ' || r.route_name || ' لم تبدأ في موعدها ' || to_char(r.scheduled_time, 'HH24:MI') || '. سنبلغك عند انطلاقها.',
           jsonb_build_object('trip_id', r.id), 'late:' || r.id
    from public.student_route_assignments a
    join public.guardian_students gs on gs.student_id = a.student_id
    join public.guardians g on g.id = gs.guardian_id and g.user_id is not null and g.status = 'active'
    where a.route_id = r.route_id and a.status = 'active'
    on conflict (user_id, dedupe_key) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.check_late_trips() from public, anon, authenticated;
select cron.schedule('masari-late-trips', '*/5 * * * *', $$select private.check_late_trips()$$)
where not exists (select 1 from cron.job where jobname = 'masari-late-trips');
