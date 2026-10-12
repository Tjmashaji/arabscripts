-- تقويم الإجازات، صيانة الباصات ووثائقها، رابط تتبع مؤقت، تحليل الحضور، ونقاط التأخير.

-- ========== الإجازات ==========
create table if not exists public.school_holidays (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 80),
  starts_on date not null,
  ends_on date not null,
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 120)
);
create index if not exists school_holidays_school_idx on public.school_holidays(school_id, starts_on);
create index if not exists school_holidays_created_by_idx on public.school_holidays(created_by);
alter table public.school_holidays enable row level security;

create or replace function private.is_driver_in_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drivers d where d.user_id = (select auth.uid()) and d.school_id = p_school and d.status = 'active')
$$;

create policy holidays_read on public.school_holidays for select to authenticated
  using (private.can_view_school(school_id) or private.is_guardian_in_school(school_id) or private.is_driver_in_school(school_id));
create policy holidays_insert on public.school_holidays for insert to authenticated
  with check (private.has_school_role(school_id, array['school_admin','operations']));
create policy holidays_update on public.school_holidays for update to authenticated
  using (private.has_school_role(school_id, array['school_admin','operations']))
  with check (private.has_school_role(school_id, array['school_admin','operations']));
grant select, insert, update on public.school_holidays to authenticated;

create or replace function private.is_school_holiday(p_school uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.school_holidays h where h.school_id = p_school and h.cancelled_at is null
                 and p_date between h.starts_on and h.ends_on)
$$;

-- إبلاغ أولياء الأمور والسائقين بالإجازة أو إلغائها
create or replace function private.on_holiday_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_body text; v_key text;
begin
  if tg_op = 'UPDATE' and new.cancelled_at is not distinct from old.cancelled_at then return new; end if;
  if new.ends_on < private.riyadh_today() then return new; end if;
  if new.cancelled_at is null then
    v_title := 'إجازة: ' || new.title;
    v_body := 'لا رحلات من ' || to_char(new.starts_on, 'YYYY-MM-DD') || case when new.ends_on > new.starts_on then ' إلى ' || to_char(new.ends_on, 'YYYY-MM-DD') else '' end || '.';
    v_key := 'holiday:' || new.id;
  else
    v_title := 'أُلغيت إجازة ' || new.title; v_body := 'الرحلات تعمل في موعدها المعتاد.'; v_key := 'holiday_cancel:' || new.id;
  end if;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select distinct u, new.school_id, 'holiday', v_title, v_body, jsonb_build_object('holiday_id', new.id), v_key
  from (select g.user_id u from public.guardians g where g.school_id = new.school_id and g.status = 'active' and g.user_id is not null
        union select d.user_id from public.drivers d where d.school_id = new.school_id and d.status = 'active' and d.user_id is not null) x
  on conflict (user_id, dedupe_key) do nothing;
  perform private.audit(new.school_id, case when new.cancelled_at is null then 'holiday_added' else 'holiday_cancelled' end, 'school_holidays', new.id::text, null, to_jsonb(new));
  return new;
end $$;
create or replace trigger school_holidays_notify after insert or update of cancelled_at on public.school_holidays
  for each row execute function private.on_holiday_change();

-- ========== صيانة الباصات ووثائقها ==========
alter table public.buses add column if not exists registration_expiry date;
alter table public.buses add column if not exists insurance_expiry date;
alter table public.buses add column if not exists inspection_expiry date;
alter table public.buses add column if not exists next_service_on date;

create table if not exists public.bus_maintenance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete cascade,
  kind text not null check (kind in ('service','repair','inspection','tires','ac','other')),
  done_on date not null default (now() at time zone 'Asia/Riyadh')::date,
  odometer_km integer check (odometer_km is null or odometer_km between 0 and 3000000),
  cost numeric(10,2) check (cost is null or cost >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  next_due_on date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bus_maintenance_bus_idx on public.bus_maintenance(bus_id, done_on desc);
create index if not exists bus_maintenance_school_idx on public.bus_maintenance(school_id);
create index if not exists bus_maintenance_created_by_idx on public.bus_maintenance(created_by);
alter table public.bus_maintenance enable row level security;
create policy maintenance_read on public.bus_maintenance for select to authenticated using (private.can_view_school(school_id));
create policy maintenance_insert on public.bus_maintenance for insert to authenticated
  with check (private.has_school_role(school_id, array['school_admin','operations'])
              and exists (select 1 from public.buses b where b.id = bus_id and b.school_id = bus_maintenance.school_id));
grant select, insert on public.bus_maintenance to authenticated;

-- آخر صيانة تحدد موعد الصيانة القادمة للباص
create or replace function private.on_maintenance_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.next_due_on is not null then
    perform set_config('masari.trusted', 'on', true);
    update public.buses set next_service_on = new.next_due_on where id = new.bus_id;
    perform set_config('masari.trusted', 'off', true);
  end if;
  perform private.audit(new.school_id, 'bus_maintenance', 'bus_maintenance', new.id::text, null, to_jsonb(new));
  return new;
end $$;
create or replace trigger bus_maintenance_after_insert after insert on public.bus_maintenance
  for each row execute function private.on_maintenance_insert();

-- سبب منع تشغيل الرحلة (إجازة، باص متأخر صيانته أو وثائقه منتهية، رخصة السائق منتهية)
create or replace function private.trip_blocker(p_school uuid, p_bus uuid, p_driver uuid, p_date date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare b public.buses; v_lic date;
begin
  if private.is_school_holiday(p_school, p_date) then return 'SCHOOL_HOLIDAY'; end if;
  select * into b from public.buses where id = p_bus;
  if found then
    if b.status = 'maintenance' then return 'BUS_IN_MAINTENANCE'; end if;
    if b.next_service_on is not null and b.next_service_on < p_date then return 'BUS_SERVICE_OVERDUE'; end if;
    if least(coalesce(b.registration_expiry, 'infinity'::date), coalesce(b.insurance_expiry, 'infinity'::date), coalesce(b.inspection_expiry, 'infinity'::date)) < p_date then
      return 'BUS_DOCS_EXPIRED';
    end if;
  end if;
  select license_expiry into v_lic from public.drivers where id = p_driver;
  if v_lic is not null and v_lic < p_date then return 'DRIVER_LICENSE_EXPIRED'; end if;
  return null;
end $$;

create or replace function private.guard_trip_operational() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if private.trusted() then return new; end if;
  if tg_op = 'UPDATE' and new.driver_id is not distinct from old.driver_id and new.bus_id is not distinct from old.bus_id then return new; end if;
  if new.status not in ('scheduled','ready') then return new; end if;
  v := private.trip_blocker(new.school_id, new.bus_id, new.driver_id, new.trip_date);
  if v is not null then raise exception '%', v using errcode = 'P0001'; end if;
  return new;
end $$;
create or replace trigger trips_operational_guard before insert or update of driver_id, bus_id on public.trips
  for each row execute function private.guard_trip_operational();

-- تنبيهات يومية: وثائق تقترب من الانتهاء، صيانة مستحقة، وغياب متكرر
create or replace function private.daily_fleet_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_today date := private.riyadh_today();
begin
  for r in
    select b.school_id, 'bus:' || b.id || ':' || k.kind || ':' || k.d as key,
           k.label || ' للباص ' || b.bus_number as what, k.d
    from public.buses b
    cross join lateral (values ('registration', 'الاستمارة', b.registration_expiry), ('insurance', 'التأمين', b.insurance_expiry),
                               ('inspection', 'الفحص الدوري', b.inspection_expiry), ('service', 'الصيانة الدورية', b.next_service_on)) k(kind, label, d)
    where b.status <> 'inactive' and k.d is not null and k.d <= v_today + 30
    union all
    select d.school_id, 'license:' || d.id || ':' || d.license_expiry, 'رخصة السائق ' || d.full_name, d.license_expiry
    from public.drivers d where d.status = 'active' and d.license_expiry is not null and d.license_expiry <= v_today + 30
  loop
    -- مرة عند 30 يومًا، ومرة عند 7 أيام، ومرة عند الانتهاء
    if r.d - v_today not in (30, 7, 0, -1) and not (r.d < v_today and extract(dow from v_today) = 0) then continue; end if;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, r.school_id, 'fleet_expiry',
           case when r.d < v_today then 'انتهت ' || r.what when r.d = v_today then 'تنتهي اليوم ' || r.what else 'تقترب نهاية ' || r.what end,
           'التاريخ ' || to_char(r.d, 'YYYY-MM-DD') || case when r.d <= v_today then '. لن تُنشأ رحلات لهذا الباص أو السائق حتى التجديد.' else '.' end,
           jsonb_build_object('date', r.d), r.key || ':' || (r.d - v_today)
    from public.school_members m where m.school_id = r.school_id and m.status = 'active' and m.role in ('school_admin','operations')
    on conflict (user_id, dedupe_key) do nothing;
    n := n + 1;
  end loop;
  -- الرخصة: تنبيه للسائق نفسه أيضًا
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select d.user_id, d.school_id, 'fleet_expiry', 'رخصتك تنتهي ' || to_char(d.license_expiry, 'YYYY-MM-DD'), 'جدّدها وأبلغ المدرسة بالتاريخ الجديد.',
         '{}'::jsonb, 'my_license:' || d.id || ':' || d.license_expiry || ':' || (d.license_expiry - v_today)
  from public.drivers d where d.status = 'active' and d.user_id is not null and d.license_expiry - v_today in (30, 7, 0)
  on conflict (user_id, dedupe_key) do nothing;
  -- غياب متكرر: 3 غيابات فأكثر خلال 14 يومًا (تنبيه أسبوعي واحد لكل طالب)
  for r in
    select st.school_id, st.id, st.full_name, count(*) c
    from public.trip_students ts join public.trips t on t.id = ts.trip_id join public.students st on st.id = ts.student_id
    where t.trip_date > v_today - 14 and ts.status in ('absent','no_show')
    group by st.school_id, st.id, st.full_name having count(*) >= 3
  loop
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, r.school_id, 'attendance', 'غياب متكرر: ' || r.full_name, r.c || ' رحلات بلا ركوب خلال أسبوعين.',
           jsonb_build_object('student_id', r.id), 'absence:' || r.id || ':' || to_char(v_today, 'IYYY-IW')
    from public.school_members m where m.school_id = r.school_id and m.status = 'active' and m.role in ('school_admin','supervisor','operations')
    on conflict (user_id, dedupe_key) do nothing;
  end loop;
  return n;
end $$;

-- ========== تحليل الحضور ==========
create or replace function public.school_attendance(p_school uuid, p_from date, p_to date)
returns table (student_id uuid, full_name text, grade text, trips bigint, rode bigint, absent bigint, no_show bigint, rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_view_school(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 370 then raise exception 'INVALID_RANGE' using errcode = '22023'; end if;
  return query
  select st.id, st.full_name, st.grade, count(*),
         count(*) filter (where ts.status in ('boarded','arrived_school','boarded_return','dropped_home')),
         count(*) filter (where ts.status = 'absent'), count(*) filter (where ts.status = 'no_show'),
         round(100.0 * count(*) filter (where ts.status in ('boarded','arrived_school','boarded_return','dropped_home')) / nullif(count(*), 0), 1)
  from public.trip_students ts join public.trips t on t.id = ts.trip_id join public.students st on st.id = ts.student_id
  where t.school_id = p_school and t.trip_date between p_from and p_to and t.status = 'completed'
  group by st.id, st.full_name, st.grade
  order by 8 nulls last, 2;
end $$;
revoke all on function public.school_attendance(uuid, date, date) from public, anon;
grant execute on function public.school_attendance(uuid, date, date) to authenticated;

-- ========== نقاط التأخير (خريطة حرارية) ==========
create or replace function public.delay_hotspots(p_days integer default 30, p_school uuid default null)
returns table (lat double precision, lng double precision, late_count bigint, avg_late_min numeric, alerts bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_school is not null and not private.can_view_school(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  with late as (
    select round(ts.latitude::numeric, 3) la, round(ts.longitude::numeric, 3) lo,
           extract(epoch from (ts.arrived_at - ((t.trip_date + ts.scheduled_time) at time zone 'Asia/Riyadh'))) / 60 m
    from public.trip_stops ts join public.trips t on t.id = ts.trip_id
    where t.trip_date > private.riyadh_today() - least(greatest(p_days, 1), 180)
      and ts.arrived_at is not null and ts.scheduled_time is not null and ts.latitude is not null
      and (p_school is null or t.school_id = p_school) and private.can_view_school(t.school_id)
  ), off as (
    select round(a.latitude::numeric, 3) la, round(a.longitude::numeric, 3) lo, count(*) c
    from public.trip_alerts a
    where a.started_at > now() - make_interval(days => least(greatest(p_days, 1), 180)) and a.latitude is not null
      and (p_school is null or a.school_id = p_school) and private.can_view_school(a.school_id)
    group by 1, 2
  ), l as (select la, lo, count(*) filter (where m > 5) c, round(avg(m) filter (where m > 5)::numeric, 1) am from late group by 1, 2)
  select coalesce(l.la, off.la)::float8, coalesce(l.lo, off.lo)::float8, coalesce(l.c, 0), l.am, coalesce(off.c, 0)
  from l full join off on off.la = l.la and off.lo = l.lo
  where coalesce(l.c, 0) + coalesce(off.c, 0) > 0
  order by coalesce(l.c, 0) + coalesce(off.c, 0) desc
  limit 300;
end $$;
revoke all on function public.delay_hotspots(integer, uuid) from public, anon;
grant execute on function public.delay_hotspots(integer, uuid) to authenticated;

-- ========== رابط تتبع مؤقت ==========
create table if not exists public.trip_share_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 40),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trip_share_links_student_idx on public.trip_share_links(student_id);
create index if not exists trip_share_links_created_by_idx on public.trip_share_links(created_by);
alter table public.trip_share_links enable row level security;
create policy share_links_own on public.trip_share_links for select to authenticated using (created_by = (select auth.uid()));
grant select on public.trip_share_links to authenticated;

create or replace function public.guardian_create_share(p_student uuid, p_hours integer default 3, p_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.is_guardian_of(p_student) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_hours not between 1 and 24 then raise exception 'INVALID_DURATION' using errcode = '22023'; end if;
  if (select count(*) from public.trip_share_links where created_by = (select auth.uid()) and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_LINKS' using errcode = 'P0001';
  end if;
  insert into public.trip_share_links (student_id, label, expires_at) values (p_student, nullif(btrim(p_label), ''), now() + make_interval(hours => p_hours))
    returning token into v;
  return v;
end $$;
revoke all on function public.guardian_create_share(uuid, integer, text) from public, anon;
grant execute on function public.guardian_create_share(uuid, integer, text) to authenticated;

create or replace function public.guardian_revoke_share(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.trip_share_links set revoked_at = now() where id = p_id and created_by = (select auth.uid()) and revoked_at is null;
end $$;
revoke all on function public.guardian_revoke_share(uuid) from public, anon;
grant execute on function public.guardian_revoke_share(uuid) to authenticated;

-- يُفتح بلا تسجيل دخول: الاسم الأول للطالب، حالة رحلة اليوم، وآخر موقع للباص فقط (لا عنوان البيت ولا أسماء آخرين)
create or replace function public.shared_trip(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.trip_share_links; st public.students; t record; v_school record;
  v_lat float8; v_lng float8; v_at timestamptz;
begin
  select * into l from public.trip_share_links where token = p_token;
  if not found or l.revoked_at is not null or l.expires_at < now() then return jsonb_build_object('ok', false); end if;
  select * into st from public.students where id = l.student_id;
  select name, latitude, longitude into v_school from public.schools where id = st.school_id;
  select tr.id, tr.status, tr.direction, ts.status as student_status, r.name as route_name
    into t
    from public.trip_students ts join public.trips tr on tr.id = ts.trip_id join public.routes r on r.id = tr.route_id
   where ts.student_id = st.id and tr.trip_date = private.riyadh_today()
   order by (tr.status = 'in_progress') desc, tr.scheduled_start desc nulls last limit 1;
  if t.id is not null and t.status = 'in_progress' then
    select latitude, longitude, recorded_at into v_lat, v_lng, v_at from public.vehicle_locations where trip_id = t.id order by recorded_at desc limit 1;
  end if;
  return jsonb_build_object('ok', true, 'student', split_part(st.full_name, ' ', 1), 'school', v_school.name,
    'school_lat', v_school.latitude, 'school_lng', v_school.longitude, 'expires_at', l.expires_at,
    'trip_status', t.status, 'direction', t.direction, 'student_status', t.student_status, 'route', t.route_name,
    'bus_lat', v_lat, 'bus_lng', v_lng, 'bus_at', v_at);
end $$;
revoke all on function public.shared_trip(uuid) from public;
grant execute on function public.shared_trip(uuid) to anon, authenticated;

select cron.schedule('masari-daily-fleet', '10 5 * * *', 'select private.daily_fleet_alerts()');
