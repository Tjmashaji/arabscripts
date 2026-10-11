-- دليل المدارس: المدارس تُستورد مسبقًا (OpenStreetMap أو يدويًا أو من ملف) بحالة «غير مفعّلة»،
-- وتُفعَّل من طرف إدارة مساري فقط بعد التحقق. أولياء الأمور يطلبون الخدمة، ومسؤولو المدارس يطلبون التفعيل.
-- قابل لإعادة التطبيق.

-- ───────── 1) حالة «غير مفعّلة» وحقول الدليل ─────────
alter table public.schools drop constraint if exists schools_status_check;
alter table public.schools add constraint schools_status_check check (status in ('unclaimed','pending','active','suspended'));
alter table public.schools add column if not exists source text not null default 'manual';
alter table public.schools drop constraint if exists schools_source_check;
alter table public.schools add constraint schools_source_check check (source in ('osm','manual','import','self'));
alter table public.schools add column if not exists external_id text;
alter table public.schools add column if not exists ministry_code text;
alter table public.schools add column if not exists district text;
alter table public.schools add column if not exists place_id text;           -- Google: المعرّف فقط، لا بيانات أخرى
alter table public.schools add column if not exists source_attribution text;
-- المدارس التي سجّلت نفسها قبل هذا التغيير
update public.schools set source = 'self' where source = 'manual' and created_by is not null and external_id is null and status <> 'unclaimed';
create unique index if not exists schools_source_external_uidx on public.schools (source, external_id);
create unique index if not exists schools_ministry_code_uidx on public.schools (ministry_code) where ministry_code is not null;

-- استدعاء من الخادم (SQL مباشر أو service_role) وليس من متصفح مستخدم
create or replace function private.is_backend() returns boolean
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claims', true), '') is null
      or (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
$$;

-- ───────── 2) لا تشغيل لمدرسة غير مفعّلة ─────────
create or replace function private.require_active_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.schools s where s.id = new.school_id and s.status = 'active') then
    raise exception 'SCHOOL_NOT_ACTIVE' using errcode = '42501';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['students','guardians','drivers','buses','routes','trips','student_onboarding_requests','driver_onboarding_requests'] loop
    execute format('create or replace trigger %I before insert on public.%I for each row execute function private.require_active_school()', t || '_require_active_school', t);
  end loop;
end $$;

-- ───────── 3) إيقاف التسجيل الذاتي للمدارس ─────────
alter policy schools_insert on public.schools with check (private.is_platform_admin());

-- حالة المدرسة لسياسات الصلاحيات (المدرسة غير المفعّلة مخفية عن القراءة المباشرة)
create or replace function private.school_status(p_school uuid) returns text
language sql stable security definer set search_path = '' as $$
  select status from public.schools where id = p_school
$$;
grant usage on schema private to authenticated;
grant execute on function private.school_status(uuid) to authenticated;

-- ───────── 4) طلبات أولياء الأمور للخدمة ─────────
create table if not exists public.school_interest (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);
alter table public.school_interest enable row level security;

-- ───────── 5) طلبات تفعيل المدرسة من مسؤوليها ─────────
create table if not exists public.school_claim_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_name text not null check (length(btrim(contact_name)) between 2 and 120),
  position text check (position is null or length(position) <= 120),
  phone text not null check (length(btrim(phone)) between 8 and 20),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'new' check (status in ('new','contacting','accepted','rejected')),
  reject_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists school_claim_open_uidx on public.school_claim_requests (school_id, user_id) where status in ('new','contacting');
alter table public.school_claim_requests enable row level security;

-- ───────── 6) دعوات مديري المدارس ─────────
create table if not exists public.school_admin_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  unique (school_id, email)
);
alter table public.school_admin_invites enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_interest' and policyname='school_interest_select') then
    create policy school_interest_select on public.school_interest for select to authenticated
      using (user_id = (select auth.uid()) or private.is_executive());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_interest' and policyname='school_interest_insert') then
    create policy school_interest_insert on public.school_interest for insert to authenticated
      with check (user_id = (select auth.uid()) and private.school_status(school_id) in ('unclaimed','pending'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_interest' and policyname='school_interest_delete') then
    create policy school_interest_delete on public.school_interest for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_claim_requests' and policyname='school_claims_select') then
    create policy school_claims_select on public.school_claim_requests for select to authenticated
      using (user_id = (select auth.uid()) or private.is_executive());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_claim_requests' and policyname='school_claims_insert') then
    create policy school_claims_insert on public.school_claim_requests for insert to authenticated
      with check (user_id = (select auth.uid()) and status = 'new' and reviewed_by is null and reject_reason is null
        and private.school_status(school_id) in ('unclaimed','pending'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='school_admin_invites' and policyname='school_invites_select') then
    create policy school_invites_select on public.school_admin_invites for select to authenticated
      using (private.is_executive());
  end if;
end $$;

-- ───────── 7) البحث عن مدرسة (الاسم والحي والموقع فقط) ─────────
create or replace function public.search_schools(p_query text default '', p_limit int default 20)
returns table (id uuid, name text, district text, city text, status text, latitude double precision, longitude double precision,
               source text, my_interest boolean, my_claim_status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.district, s.city, s.status, s.latitude, s.longitude, s.source,
    exists (select 1 from public.school_interest i where i.school_id = s.id and i.user_id = (select auth.uid())),
    (select c.status from public.school_claim_requests c where c.school_id = s.id and c.user_id = (select auth.uid()) order by c.created_at desc limit 1)
  from public.schools s
  where (select auth.uid()) is not null
    and s.status in ('unclaimed','active')
    and (coalesce(btrim(p_query), '') = '' or s.name ilike '%' || btrim(p_query) || '%' or s.district ilike '%' || btrim(p_query) || '%'
         or s.city ilike '%' || btrim(p_query) || '%' or s.name_en ilike '%' || btrim(p_query) || '%')
  order by (s.status = 'active') desc, s.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- ───────── 8) دليل المدارس للإدارة ─────────
create or replace function public.admin_school_directory(p_status text default null, p_query text default null)
returns table (id uuid, name text, name_en text, district text, city text, status text, source text, ministry_code text,
               latitude double precision, longitude double precision, phone text, email text, logo_url text, description text,
               interest_count bigint, open_claims bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_executive() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select s.id, s.name, s.name_en, s.district, s.city, s.status, s.source, s.ministry_code, s.latitude, s.longitude, s.phone, s.email,
    s.logo_url, s.description,
    (select count(*) from public.school_interest i where i.school_id = s.id),
    (select count(*) from public.school_claim_requests c where c.school_id = s.id and c.status in ('new','contacting')),
    s.created_at
  from public.schools s
  where (p_status is null or s.status = p_status)
    and (coalesce(btrim(p_query), '') = '' or s.name ilike '%' || btrim(p_query) || '%' or s.district ilike '%' || btrim(p_query) || '%'
         or s.ministry_code = btrim(p_query))
  order by 15 desc, 16 desc, s.name
  limit 500;
end $$;

-- ───────── 9) إضافة مدرسة يدويًا مع منع التكرار ─────────
create or replace function public.admin_add_school(p_name text, p_district text default null, p_city text default null,
  p_ministry_code text default null, p_lat double precision default null, p_lng double precision default null,
  p_place_id text default null, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dups jsonb; v_id uuid;
begin
  if not (private.is_executive() or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_name)), 0) < 3 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status,
           'distance_m', round(private.distance_m(p_lat, p_lng, s.latitude, s.longitude)))), '[]'::jsonb)
    into v_dups
  from public.schools s
  where (s.latitude is not null and private.distance_m(p_lat, p_lng, s.latitude, s.longitude) < 150)
     or (p_ministry_code is not null and s.ministry_code = btrim(p_ministry_code))
     or lower(regexp_replace(s.name, '\s+', '', 'g')) = lower(regexp_replace(p_name, '\s+', '', 'g'));
  if jsonb_array_length(v_dups) > 0 and not coalesce(p_force, false) then
    return jsonb_build_object('created', false, 'duplicates', v_dups);
  end if;
  insert into public.schools (name, district, city, ministry_code, latitude, longitude, place_id, status, source, created_by)
  values (btrim(p_name), nullif(btrim(p_district), ''), nullif(btrim(p_city), ''), nullif(btrim(p_ministry_code), ''),
          p_lat, p_lng, nullif(btrim(p_place_id), ''), 'unclaimed', 'manual', null)
  returning id into v_id;
  perform private.audit(v_id, 'school_added', 'schools', v_id::text, null, jsonb_build_object('name', p_name, 'source', 'manual'));
  return jsonb_build_object('created', true, 'id', v_id, 'duplicates', v_dups);
end $$;

-- ───────── 10) استيراد دفعة (CSV أو OpenStreetMap) بدون تكرار ─────────
-- كل صف: {name, district?, city?, ministry_code?, lat, lng, external_id?}
create or replace function public.admin_import_schools(p_rows jsonb, p_source text default 'import') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_ext text; v_inserted int := 0; v_updated int := 0; v_skipped int := 0; v_new boolean;
  v_attr text := case when p_source = 'osm' then '© OpenStreetMap contributors' else null end;
begin
  if not (private.is_executive() or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_source not in ('osm','import') then raise exception 'INVALID_SOURCE' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'INVALID_ROWS' using errcode = 'P0001'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(length(btrim(r->>'name')), 0) < 3 or (r->>'lat') is null or (r->>'lng') is null
       or (r->>'lat')::double precision not between -90 and 90 or (r->>'lng')::double precision not between -180 and 180 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_ext := coalesce(nullif(btrim(r->>'external_id'), ''), nullif(btrim(r->>'ministry_code'), ''),
                      md5(btrim(r->>'name') || round((r->>'lat')::numeric, 4) || round((r->>'lng')::numeric, 4)));
    insert into public.schools (name, district, city, ministry_code, latitude, longitude, status, source, external_id, source_attribution, created_by)
    values (btrim(r->>'name'), nullif(btrim(r->>'district'), ''), nullif(btrim(r->>'city'), ''), nullif(btrim(r->>'ministry_code'), ''),
            (r->>'lat')::double precision, (r->>'lng')::double precision, 'unclaimed', p_source, v_ext, v_attr, null)
    on conflict (source, external_id) do update
      set name = excluded.name, district = coalesce(excluded.district, public.schools.district),
          city = coalesce(excluded.city, public.schools.city), ministry_code = coalesce(excluded.ministry_code, public.schools.ministry_code),
          latitude = excluded.latitude, longitude = excluded.longitude, source_attribution = excluded.source_attribution
    returning (xmax = 0) into v_new;
    if v_new then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
end $$;

-- ───────── 11) مراجعة طلب التفعيل ─────────
create or replace function public.admin_review_claim(p_request uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.school_claim_requests;
begin
  if not private.is_executive() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('contacting','rejected','accepted') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_status = 'rejected' and coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.school_claim_requests set status = p_status, reject_reason = case when p_status = 'rejected' then btrim(p_reason) end,
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request returning * into c;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.audit(c.school_id, 'claim_' || p_status, 'school_claim_requests', p_request::text, null, jsonb_build_object('reason', p_reason));
end $$;

-- ───────── 12) تفعيل المدرسة ودعوة مديرها ─────────
create or replace function public.activate_school(p_school uuid, p_admin_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.schools; v_email text := lower(btrim(p_admin_email)); v_user uuid; v_linked boolean := false; v_notified int := 0;
begin
  if not (private.is_executive() or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL' using errcode = 'P0001'; end if;
  select * into s from public.schools where id = p_school for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if s.status = 'active' and exists (select 1 from public.school_members m where m.school_id = p_school and m.role = 'school_admin' and m.status = 'active') then
    raise exception 'ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  perform set_config('masari.trusted', 'on', true);
  update public.schools set status = 'active' where id = p_school;
  insert into public.school_admin_invites (school_id, email, created_by) values (p_school, v_email, (select auth.uid()))
    on conflict (school_id, email) do nothing;

  -- إن كان صاحب البريد مسجلًا ومؤكدًا: يصبح مدير المدرسة الآن
  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_user is not null then
    insert into public.school_members (school_id, user_id, role, status, created_by)
      values (p_school, v_user, 'school_admin', 'active', (select auth.uid()))
      on conflict (school_id, user_id) do update set role = 'school_admin', status = 'active';
    update public.profiles set status = 'active' where user_id = v_user and status = 'pending';
    update public.school_admin_invites set accepted_by = v_user, accepted_at = now() where school_id = p_school and email = v_email;
    v_linked := true;
  end if;
  update public.school_claim_requests set status = 'accepted', reviewed_by = (select auth.uid()), reviewed_at = now()
    where school_id = p_school and lower(email) = v_email and status in ('new','contacting');

  -- إبلاغ أولياء الأمور الذين طلبوا الخدمة في هذه المدرسة
  insert into public.notifications (user_id, school_id, type, title, body, dedupe_key, data)
  select i.user_id, p_school, 'school_activated', 'مدرسة ابنك صارت على مساري',
         s.name || ' فعّلت خدمة مساري. ستضيفك المدرسة ببريدك لتتابع رحلة ابنك.', 'school_activated:' || p_school, jsonb_build_object('school_id', p_school)
  from public.school_interest i where i.school_id = p_school
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_notified = row_count;

  perform private.audit(p_school, 'school_activated', 'schools', p_school::text,
    jsonb_build_object('status', s.status), jsonb_build_object('status', 'active', 'admin_email', v_email, 'linked_now', v_linked));
  return jsonb_build_object('activated', true, 'admin_email', v_email, 'linked_now', v_linked, 'user_exists', v_user is not null, 'notified', v_notified);
end $$;

-- ───────── 13) الربط التلقائي يشمل دعوات مديري المدارس ─────────
create or replace function public.claim_my_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_confirmed timestamptz;
  v_drivers int := 0; v_guardians int := 0; v_schools int := 0; v_activated boolean := false; inv record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is null or v_confirmed is null then
    return jsonb_build_object('linked_drivers', 0, 'linked_guardians', 0, 'linked_schools', 0, 'activated', false, 'reason', 'EMAIL_NOT_CONFIRMED');
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

  for inv in select i.id, i.school_id from public.school_admin_invites i join public.schools s on s.id = i.school_id
             where i.email = v_email and i.accepted_at is null and s.status = 'active' loop
    insert into public.school_members (school_id, user_id, role, status, created_by)
      values (inv.school_id, v_uid, 'school_admin', 'active', v_uid)
      on conflict (school_id, user_id) do update set role = 'school_admin', status = 'active';
    update public.school_admin_invites set accepted_by = v_uid, accepted_at = now() where id = inv.id;
    v_schools := v_schools + 1;
  end loop;

  if v_schools > 0
     or exists (select 1 from public.drivers d join public.schools s on s.id = d.school_id
             where d.user_id = v_uid and d.status = 'active' and s.status = 'active')
     or exists (select 1 from public.guardians g join public.schools s on s.id = g.school_id
             where g.user_id = v_uid and g.status = 'active' and s.status = 'active') then
    update public.profiles set status = 'active' where user_id = v_uid and status = 'pending';
    v_activated := found;
  end if;

  return jsonb_build_object('linked_drivers', v_drivers, 'linked_guardians', v_guardians, 'linked_schools', v_schools, 'activated', v_activated);
end $$;
