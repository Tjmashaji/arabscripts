-- 1) موقع المدرسة ثابت بعد تحديده: لا يغيّره إلا مدير النظام.
-- 2) ولي الأمر يحدد موقع البيت مرة واحدة، وأي تعديل لاحق يكون طلبًا تعتمده المدرسة.
-- 3) السائق يسجّل بنفسه ويختار المدرسة، فيصل طلب انضمام تعتمده المدرسة ويُربط حسابه.

create or replace function private.guard_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.trusted() and not private.is_platform_admin() then
    if new.status is distinct from old.status or new.created_by is distinct from old.created_by then
      raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
    end if;
    if old.latitude is not null and old.longitude is not null
       and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
      raise exception 'SCHOOL_LOCATION_LOCKED' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ───────── طلبات تعديل موقع المنزل ─────────
create table if not exists public.home_location_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (address is null or length(address) <= 300),
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists home_location_requests_one_open on public.home_location_requests (student_id) where status = 'pending';
create index if not exists home_location_requests_school on public.home_location_requests (school_id, status);
create index if not exists home_location_requests_requested_by on public.home_location_requests (requested_by);
create index if not exists home_location_requests_reviewed_by on public.home_location_requests (reviewed_by);
alter table public.home_location_requests enable row level security;

create policy home_location_requests_select on public.home_location_requests for select to authenticated
  using (requested_by = (select auth.uid()) or private.can_view_school(school_id));
create policy home_location_requests_insert on public.home_location_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and status = 'pending' and reviewed_by is null and private.is_guardian_of(student_id));
grant select, insert on public.home_location_requests to authenticated;

create or replace function private.prepare_home_location_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select school_id, full_name into new.school_id, v_name from public.students where id = new.student_id;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select m.user_id, new.school_id, 'home_location_request', 'طلب تعديل موقع منزل',
         'ولي أمر ' || v_name || ' يطلب تعديل موقع المنزل.', jsonb_build_object('request_id', new.id), 'home_loc:' || new.id
  from public.school_members m
  where m.school_id = new.school_id and m.status = 'active' and m.role in ('school_admin','operations')
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;
create or replace trigger home_location_requests_prepare before insert on public.home_location_requests
  for each row execute function private.prepare_home_location_request();

-- ولي الأمر يحدد موقع البيت أول مرة فقط (إذا كان فارغًا)
create or replace function public.guardian_set_home(p_student uuid, p_lat double precision, p_lng double precision, p_address text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_guardian_of(p_student) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'INVALID_LOCATION' using errcode = 'P0001'; end if;
  if exists (select 1 from public.students where id = p_student and home_latitude is not null and home_longitude is not null) then
    raise exception 'HOME_ALREADY_SET' using errcode = 'P0001';
  end if;
  update public.students set home_latitude = p_lat, home_longitude = p_lng,
    home_address = coalesce(nullif(btrim(p_address), ''), home_address) where id = p_student;
end $$;
revoke execute on function public.guardian_set_home(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.guardian_set_home(uuid, double precision, double precision, text) to authenticated;

-- المدرسة تعتمد أو ترفض طلب تعديل الموقع
create or replace function public.review_home_location_request(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.home_location_requests; v_name text;
begin
  select * into r from public.home_location_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_REVIEWED' using errcode = 'P0001'; end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select full_name into v_name from public.students where id = r.student_id;
  if p_approve then
    update public.students set home_latitude = r.latitude, home_longitude = r.longitude,
      home_address = coalesce(nullif(btrim(r.address), ''), home_address) where id = r.student_id;
  end if;
  update public.home_location_requests set status = case when p_approve then 'approved' else 'rejected' end,
    review_note = nullif(btrim(p_note), ''), reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_request;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  values (r.requested_by, r.school_id, 'home_location_' || case when p_approve then 'approved' else 'rejected' end,
          case when p_approve then 'تم اعتماد موقع المنزل الجديد' else 'لم يُعتمد تعديل موقع المنزل' end,
          v_name || case when p_approve then ': اعتمدت المدرسة الموقع الجديد، وقد تُعدَّل المحطة.' else ': ' || btrim(p_note) end,
          jsonb_build_object('request_id', p_request), 'home_loc_result:' || p_request)
  on conflict (user_id, dedupe_key) do nothing;
end $$;
revoke execute on function public.review_home_location_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_home_location_request(uuid, boolean, text) to authenticated;

-- ───────── تسجيل السائق بنفسه ─────────
create unique index if not exists driver_requests_one_open on public.driver_onboarding_requests (school_id, created_by) where status = 'pending';

-- السائق لا يرى جدول المدارس قبل قبوله، فنتحقق من تفعيل المدرسة بدالة موثوقة
create or replace function private.school_is_active(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.schools where id = p_school and status = 'active')
$$;
revoke execute on function private.school_is_active(uuid) from public, anon;
grant execute on function private.school_is_active(uuid) to authenticated;

create policy driver_onboarding_requests_self_insert on public.driver_onboarding_requests for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and driver_id is null and reviewed_by is null
              and private.school_is_active(school_id));
create policy driver_onboarding_requests_self_select on public.driver_onboarding_requests for select to authenticated
  using (created_by = (select auth.uid()));

create or replace function private.validate_driver_self_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_school_staff(new.school_id) then
    if coalesce(length(btrim(new.driver_name)), 0) < 3 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
    if coalesce(length(btrim(new.phone)), 0) < 9 then raise exception 'PHONE_REQUIRED' using errcode = 'P0001'; end if;
    new.email := (select lower(email) from auth.users where id = (select auth.uid()));
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, new.school_id, 'driver_request', 'طلب انضمام سائق',
           btrim(new.driver_name) || ' يطلب الانضمام سائقًا لمدرستكم.', jsonb_build_object('request_id', new.id), 'driver_request:' || new.id
    from public.school_members m
    where m.school_id = new.school_id and m.status = 'active' and m.role in ('school_admin','operations')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end $$;
create or replace trigger driver_requests_validate_self before insert on public.driver_onboarding_requests
  for each row execute function private.validate_driver_self_request();

create or replace function public.review_driver_request(p_request uuid, p_approve boolean,
  p_note text default null, p_bus uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.driver_onboarding_requests; v_driver uuid; v_self uuid; v_school text;
begin
  select * into r from public.driver_onboarding_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_REVIEWED' using errcode = 'P0001'; end if;
  select name into v_school from public.schools where id = r.school_id;
  -- طلب قدّمه السائق بنفسه (ليس من موظفي المدرسة)
  if r.created_by is not null and not exists (select 1 from public.school_members m where m.user_id = r.created_by and m.school_id = r.school_id) then
    v_self := r.created_by;
  end if;

  if not p_approve then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.driver_onboarding_requests
      set status = 'rejected', review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
      where id = p_request;
    if v_self is not null then
      insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
      values (v_self, r.school_id, 'driver_request_rejected', 'لم يُقبل طلب الانضمام', v_school || ': ' || btrim(p_note),
              jsonb_build_object('request_id', p_request), 'driver_request_result:' || p_request)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    return null;
  end if;

  begin
    insert into public.drivers(school_id, user_id, full_name, phone, email, status)
      values (r.school_id, v_self, r.driver_name, r.phone, nullif(lower(btrim(r.email)), ''), 'active')
      returning id into v_driver;
  exception when unique_violation then
    raise exception 'DUPLICATE_DRIVER' using errcode = 'P0001';
  end;

  if p_bus is not null then
    update public.buses set driver_id = v_driver where id = p_bus and school_id = r.school_id;
    if not found then raise exception 'BUS_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;

  if v_self is not null then
    perform set_config('masari.trusted', 'on', true);
    update public.profiles set status = 'active' where user_id = v_self and status = 'pending';
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (v_self, r.school_id, 'driver_request_approved', 'تم قبولك سائقًا', v_school || ' قبلت طلبك. ستظهر رحلاتك بعد إسنادك إلى مسار.',
            jsonb_build_object('request_id', p_request), 'driver_request_result:' || p_request)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  update public.driver_onboarding_requests
    set status = 'approved', driver_id = v_driver, review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_request;
  return v_driver;
end $$;

create or replace function public.my_driver_requests()
returns table (id uuid, school_id uuid, school_name text, status text, review_note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.school_id, s.name, r.status, r.review_note, r.created_at
  from public.driver_onboarding_requests r join public.schools s on s.id = r.school_id
  where r.created_by = (select auth.uid())
    and not exists (select 1 from public.school_members m where m.user_id = r.created_by and m.school_id = r.school_id)
  order by r.created_at desc limit 20
$$;
revoke execute on function public.my_driver_requests() from public, anon;
grant execute on function public.my_driver_requests() to authenticated;

