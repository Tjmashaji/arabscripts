-- مساري: كل الـ Migrations في ملف واحد. شغّله مرة واحدة في SQL Editor لمشروع masari (hramsoavpanetdhwpokr).
begin;

-- ================= 20261004000100_schema.sql =================
-- مساري — المخطط الأساسي (قابل لإعادة التطبيق)
-- الجداول + القيود + الفهارس + المشغلات العامة. السياسات في الملف التالي.

create extension if not exists pgcrypto;
create schema if not exists private;

-- ───────────────────────── أدوات عامة ─────────────────────────
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- ───────────────────────── الحسابات ─────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- أدوار مستوى المنصة فقط. لا يكتب فيه أي عميل؛ يدار من مدير النظام.
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','executive')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  contact_name text,
  phone text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  stop_radius_m integer not null default 250 check (stop_radius_m between 30 and 2000),
  max_gps_accuracy_m integer not null default 150 check (max_gps_accuracy_m between 10 and 1000),
  offline_after_seconds integer not null default 120 check (offline_after_seconds between 30 and 3600),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists schools_status_idx on public.schools(status);

create table if not exists public.school_branches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin','operations','control_tower')),
  status text not null default 'active' check (status in ('pending','active','suspended')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);
create index if not exists school_members_user_idx on public.school_members(user_id);

-- ───────────────────────── الطلاب وأولياء الأمور ─────────────────────────
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid references public.school_branches(id) on delete set null,
  full_name text not null,
  grade text,
  class_name text,
  photo_path text,
  home_address text,
  home_label text,
  home_latitude double precision,
  home_longitude double precision,
  pickup_contact_name text,
  pickup_contact_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  service_status text not null default 'pending' check (service_status in ('pending','active','suspended','inactive')),
  qr_token uuid not null default gen_random_uuid() unique,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_school_idx on public.students(school_id, service_status);
create unique index if not exists students_no_duplicates
  on public.students (school_id, lower(btrim(full_name)), coalesce(lower(grade), ''), coalesce(pickup_contact_phone, ''));

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);
create index if not exists guardians_user_idx on public.guardians(user_id);
create unique index if not exists guardians_school_email on public.guardians (school_id, lower(email)) where email is not null;

create table if not exists public.guardian_students (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  relation text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (guardian_id, student_id)
);
create index if not exists guardian_students_student_idx on public.guardian_students(student_id);

create table if not exists public.student_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  student_name text not null,
  grade text,
  parent_name text,
  parent_phone text,
  parent_email text,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
  status text not null default 'pending' check (status in ('pending','pending_parent_account','approved','rejected')),
  student_id uuid references public.students(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_requests_school_idx on public.student_onboarding_requests(school_id, status, created_at desc);

-- ───────────────────────── السائقون والباصات ─────────────────────────
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  license_number text,
  license_expiry date,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drivers_school_idx on public.drivers(school_id, status);
create unique index if not exists drivers_school_email on public.drivers (school_id, lower(email)) where email is not null;

create table if not exists public.driver_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  driver_name text not null,
  phone text,
  email text,
  vehicle_plate text,
  vehicle_capacity integer check (vehicle_capacity is null or vehicle_capacity > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  driver_id uuid references public.drivers(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_requests_school_idx on public.driver_onboarding_requests(school_id, status, created_at desc);

create table if not exists public.buses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  bus_number text not null,
  plate_number text not null,
  capacity integer not null check (capacity > 0),
  driver_id uuid references public.drivers(id) on delete set null,
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, plate_number),
  unique (school_id, bus_number)
);
create index if not exists buses_driver_idx on public.buses(driver_id);

-- ───────────────────────── المسارات ─────────────────────────
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  bus_id uuid references public.buses(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  name text not null,
  direction text not null default 'to_school' check (direction in ('to_school','to_home')),
  scheduled_time time,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name, direction)
);
create index if not exists routes_school_idx on public.routes(school_id, is_active);
create index if not exists routes_driver_idx on public.routes(driver_id);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  stop_order integer not null check (stop_order > 0),
  label text not null,
  stop_type text not null default 'pickup' check (stop_type in ('pickup','dropoff','school')),
  scheduled_time time,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_m integer check (radius_m is null or radius_m between 30 and 2000),
  student_id uuid references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_stops_order_unique unique (route_id, stop_order) deferrable initially deferred
);

create table if not exists public.student_route_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  stop_id uuid references public.route_stops(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, route_id)
);
create index if not exists sra_route_idx on public.student_route_assignments(route_id, status);

-- منع تجاوز سعة الباص، ومنع ربط طالب بمسار مدرسة أخرى
create or replace function private.check_route_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_count integer; v_route_school uuid; v_student_school uuid;
begin
  select r.school_id, b.capacity into v_route_school, v_capacity
    from public.routes r left join public.buses b on b.id = r.bus_id where r.id = new.route_id;
  select school_id into v_student_school from public.students where id = new.student_id;
  if v_route_school is distinct from v_student_school then
    raise exception 'STUDENT_ROUTE_SCHOOL_MISMATCH' using errcode = 'P0001';
  end if;
  if new.stop_id is not null and not exists (select 1 from public.route_stops s where s.id = new.stop_id and s.route_id = new.route_id) then
    raise exception 'STOP_NOT_IN_ROUTE' using errcode = 'P0001';
  end if;
  if new.status = 'active' and v_capacity is not null then
    select count(*) into v_count from public.student_route_assignments
      where route_id = new.route_id and status = 'active' and id <> new.id;
    if v_count >= v_capacity then
      raise exception 'BUS_CAPACITY_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create or replace trigger student_route_assignments_check
  before insert or update on public.student_route_assignments
  for each row execute function private.check_route_assignment();

-- ───────────────────────── الرحلات ─────────────────────────
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  bus_id uuid references public.buses(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  trip_date date not null default ((now() at time zone 'Asia/Riyadh')::date),
  direction text not null default 'to_school' check (direction in ('to_school','to_home')),
  status text not null default 'scheduled' check (status in ('scheduled','ready','in_progress','paused','completed','cancelled','emergency')),
  scheduled_start timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_school_idx on public.trips(school_id, trip_date desc, status);
create index if not exists trips_driver_idx on public.trips(driver_id, trip_date desc);
create index if not exists trips_route_idx on public.trips(route_id, trip_date desc);
-- رحلة واحدة غير ملغاة لكل مسار/سائق/باص في اليوم والاتجاه نفسه
create unique index if not exists trips_route_day on public.trips(route_id, trip_date, direction) where status <> 'cancelled';
create unique index if not exists trips_driver_day on public.trips(driver_id, trip_date, direction) where status <> 'cancelled' and driver_id is not null;
create unique index if not exists trips_bus_day on public.trips(bus_id, trip_date, direction) where status <> 'cancelled' and bus_id is not null;
-- رحلة نشطة واحدة فقط للسائق وللباص
create unique index if not exists trips_one_active_per_driver on public.trips(driver_id) where status in ('in_progress','paused','emergency') and driver_id is not null;
create unique index if not exists trips_one_active_per_bus on public.trips(bus_id) where status in ('in_progress','paused','emergency') and bus_id is not null;

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  route_stop_id uuid references public.route_stops(id) on delete set null,
  stop_order integer not null,
  label text not null,
  stop_type text not null default 'pickup',
  scheduled_time time,
  latitude double precision,
  longitude double precision,
  radius_m integer,
  status text not null default 'pending' check (status in ('pending','arrived','skipped')),
  arrived_at timestamptz,
  arrived_latitude double precision,
  arrived_longitude double precision,
  arrived_accuracy_m double precision,
  arrived_distance_m double precision,
  created_at timestamptz not null default now(),
  unique (trip_id, stop_order)
);

create table if not exists public.trip_students (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  trip_stop_id uuid references public.trip_stops(id) on delete set null,
  status text not null default 'not_boarded' check (status in
    ('not_boarded','waiting','boarded','arrived_school','absent','boarded_return','dropped_home','no_show','emergency')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, student_id)
);
create index if not exists trip_students_student_idx on public.trip_students(student_id);

create table if not exists public.vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  bus_id uuid references public.buses(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  speed double precision,
  heading double precision,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_locations_trip_idx on public.vehicle_locations(trip_id, created_at desc);
create index if not exists vehicle_locations_school_idx on public.vehicle_locations(school_id, created_at desc);

-- السائق لا يحدد المدرسة/الباص/السائق بنفسه: تؤخذ من الرحلة
create or replace function private.fill_vehicle_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.school_id, t.driver_id, t.bus_id into new.school_id, new.driver_id, new.bus_id
    from public.trips t where t.id = new.trip_id;
  new.created_at := now();
  return new;
end $$;
create or replace trigger vehicle_locations_fill before insert on public.vehicle_locations
  for each row execute function private.fill_vehicle_location();

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  event_type text not null check (event_type in
    ('boarded','arrived_school','absent','boarded_return','dropped_home','no_show','emergency')),
  method text not null default 'manual' check (method in ('manual','qr','system','guardian')),
  device_info text,
  latitude double precision,
  longitude double precision,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (trip_id, student_id, event_type)
);
create index if not exists attendance_school_idx on public.attendance_logs(school_id, created_at desc);
create index if not exists attendance_student_idx on public.attendance_logs(student_id, created_at desc);

create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  event_type text not null check (event_type in
    ('note','trip_started','trip_paused','trip_resumed','trip_completed','trip_cancelled','stop_arrived','pickup','dropoff','absent','delay','emergency')),
  latitude double precision,
  longitude double precision,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists trip_events_trip_idx on public.trip_events(trip_id, created_at desc);

create or replace function private.fill_trip_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.school_id into new.school_id from public.trips t where t.id = new.trip_id;
  return new;
end $$;
create or replace trigger trip_events_fill before insert on public.trip_events
  for each row execute function private.fill_trip_event();

-- ───────────────────────── الإشعارات والطوارئ والدعم ─────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bus_approaching boolean not null default true,
  student_boarded boolean not null default true,
  arrived_school boolean not null default true,
  dropped_home boolean not null default true,
  delays boolean not null default true,
  emergencies boolean not null default true,
  subscription boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text,
  auth_key text,
  platform text,
  created_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

create table if not exists public.emergency_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  reported_by uuid not null references auth.users(id) default auth.uid(),
  type text not null default 'emergency' check (type in ('emergency','breakdown','delay','accident','other')),
  description text,
  latitude double precision,
  longitude double precision,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emergency_school_idx on public.emergency_reports(school_id, status, created_at desc);

create table if not exists public.ratings_feedback (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  author_user_id uuid not null references auth.users(id) default auth.uid(),
  author_name text,
  author_role text,
  rating integer check (rating between 1 and 5),
  category text,
  message text not null,
  status text not null default 'new' check (status in ('new','in_review','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_school_idx on public.ratings_feedback(school_id, status, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  subject text not null,
  message text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  reply text,
  replied_by uuid references auth.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_school_idx on public.support_messages(school_id, status, created_at desc);
create index if not exists support_user_idx on public.support_messages(user_id, created_at desc);

-- ───────────────────────── الاشتراكات والمدفوعات ─────────────────────────
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  name text not null,
  period text not null check (period in ('monthly','term','yearly')),
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'SAR',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid references public.guardians(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','active','expired','cancelled')),
  starts_on date,
  ends_on date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists subscriptions_school_idx on public.subscriptions(school_id, status);
create index if not exists subscriptions_student_idx on public.subscriptions(student_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  guardian_id uuid references public.guardians(id) on delete set null,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'SAR',
  status text not null default 'issued' check (status in ('draft','issued','paid','void','refunded')),
  due_date date,
  issued_at timestamptz default now(),
  paid_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_school_idx on public.invoices(school_id, status, created_at desc);

-- لا تُخزَّن أي بيانات بطاقة. الكتابة من الخادم (Webhook بمفتاح الخدمة) فقط.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  provider text not null default 'sandbox',
  provider_reference text unique,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'SAR',
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_school_idx on public.payments(school_id, status, created_at desc);

-- ───────────────────────── سجل التدقيق ─────────────────────────
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_school_idx on public.audit_logs(school_id, created_at desc);
create index if not exists audit_actor_idx on public.audit_logs(actor_id, created_at desc);

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  insert into public.audit_logs(school_id, actor_id, action, table_name, record_id, old_values, new_values)
  values (
    case when tg_table_name = 'schools' then (v_row->>'id')::uuid else nullif(v_row->>'school_id','')::uuid end,
    auth.uid(), lower(tg_op), tg_table_name, coalesce(v_row->>'id', v_row->>'user_id'), v_old, v_new);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','schools','school_members','students','guardians','guardian_students',
    'drivers','buses','routes','student_route_assignments','trips','subscriptions','invoices','payments','emergency_reports'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  -- updated_at
  for t in select c.table_name from information_schema.columns c
           where c.table_schema = 'public' and c.column_name = 'updated_at' loop
    execute format('create or replace trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ───────────────────────── إنشاء الملف الشخصي تلقائيًا ─────────────────────────
-- الاسم للعرض فقط. لا تؤخذ أي صلاحية من user_metadata، والحساب يبدأ pending دائمًا.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, full_name, status)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), 'pending')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists masari_on_auth_user_created on auth.users;
create trigger masari_on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ================= 20261004000200_rls.sql =================
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

-- ================= 20261010000300_functions.sql =================
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

commit;
