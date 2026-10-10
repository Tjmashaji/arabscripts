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
