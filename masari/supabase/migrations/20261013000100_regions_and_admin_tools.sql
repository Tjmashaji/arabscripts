-- المرحلة ١: الإدارة التنفيذية = إدارة منطقة (محافظة واحدة لكل حساب، مثل الخرج).
-- ترى مدارس منطقتها فقط (المسجلة وغير المسجلة) وبرج مراقبتها وتقاريرها، وتفعّل مدارسها.
-- مدير النظام (super_admin) = المطوّر: كل شيء، بما فيه إدارة المستخدمين وتعديل وحذف أي سجل.

-- ───────── 1) المنطقة ─────────
alter table public.schools add column if not exists region text;
update public.schools set region = btrim(city) where region is null and nullif(btrim(city), '') is not null;
create index if not exists schools_region_idx on public.schools (region);

create or replace function private.school_default_region() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.region is null then new.region := nullif(btrim(new.city), ''); end if;
  return new;
end $$;
create or replace trigger schools_default_region before insert or update of city, region on public.schools
  for each row execute function private.school_default_region();

alter table public.user_roles add column if not exists region text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_executive_region') then
    alter table public.user_roles add constraint user_roles_executive_region check (role <> 'executive' or nullif(btrim(region), '') is not null);
  end if;
end $$;

-- منطقة الإدارة التنفيذية للمستخدم الحالي
create or replace function private.my_region() returns text
language sql stable security definer set search_path = '' as $$
  select r.region from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'executive' order by r.created_at limit 1
$$;

-- هل المستخدم مدير النظام، أو إدارة تنفيذية والمدرسة في منطقتها؟
create or replace function private.is_executive_for(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or (private.is_executive() and p_school is not null and exists (
    select 1 from public.schools s where s.id = p_school and s.region is not null and s.region = private.my_region()))
$$;
grant execute on function private.my_region() to authenticated;
grant execute on function private.is_executive_for(uuid) to authenticated;

-- ───────── 2) تقييد الرؤية بالمنطقة ─────────
create or replace function private.can_view_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_executive_for(p_school) or (private.is_active_user() and exists (
    select 1 from public.school_members m
    where m.user_id = (select auth.uid()) and m.school_id = p_school and m.status = 'active'))
$$;

alter policy school_interest_select on public.school_interest using (user_id = (select auth.uid()) or private.is_executive_for(school_id));
alter policy school_claims_select on public.school_claim_requests using (user_id = (select auth.uid()) or private.is_executive_for(school_id));
alter policy school_invites_select on public.school_admin_invites using (private.is_executive_for(school_id));
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and cmd = 'SELECT' loop
    execute format('alter policy %I on public.audit_logs using (private.is_platform_admin() or (school_id is not null and (private.is_executive_for(school_id) or private.is_school_admin(school_id))))', p.policyname);
  end loop;
end $$;

-- ───────── 3) دوال دليل المدارس مقيّدة بالمنطقة ─────────
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
  where private.is_executive_for(s.id)
    and (p_status is null or s.status = p_status)
    and (coalesce(btrim(p_query), '') = '' or s.name ilike '%' || btrim(p_query) || '%' or s.district ilike '%' || btrim(p_query) || '%'
         or s.ministry_code = btrim(p_query))
  order by 15 desc, 16 desc, s.name
  limit 500;
end $$;

create or replace function public.admin_claim_requests(p_status text default null)
returns table (id uuid, school_id uuid, school_name text, school_district text, school_status text, contact_name text, "position" text,
               phone text, email text, note text, status text, reject_reason text, created_at timestamptz, interest_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_executive() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select c.id, s.id, s.name, s.district, s.status, c.contact_name, c.position, c.phone, c.email, c.note, c.status, c.reject_reason, c.created_at,
    (select count(*) from public.school_interest i where i.school_id = s.id)
  from public.school_claim_requests c join public.schools s on s.id = c.school_id
  where private.is_executive_for(s.id) and ((p_status is null and c.status in ('new','contacting')) or c.status = p_status)
  order by (c.status = 'new') desc, c.created_at
  limit 300;
end $$;

create or replace function public.admin_add_school(p_name text, p_district text default null, p_city text default null,
  p_ministry_code text default null, p_lat double precision default null, p_lng double precision default null,
  p_place_id text default null, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dups jsonb; v_id uuid; v_region text := private.my_region();
begin
  if not (private.is_executive() or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  -- مدير النظام يضيف في أي منطقة، والإدارة التنفيذية في منطقتها فقط
  if private.is_platform_admin() or private.is_backend() then v_region := coalesce(nullif(btrim(p_city), ''), v_region);
  elsif v_region is null then raise exception 'NO_REGION' using errcode = '42501'; end if;
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
  insert into public.schools (name, district, city, region, ministry_code, latitude, longitude, place_id, status, source, created_by)
  values (btrim(p_name), nullif(btrim(p_district), ''), coalesce(nullif(btrim(p_city), ''), v_region), v_region, nullif(btrim(p_ministry_code), ''),
          p_lat, p_lng, nullif(btrim(p_place_id), ''), 'unclaimed', 'manual', null)
  returning id into v_id;
  perform private.audit(v_id, 'school_added', 'schools', v_id::text, null, jsonb_build_object('name', p_name, 'source', 'manual'));
  return jsonb_build_object('created', true, 'id', v_id, 'duplicates', v_dups);
end $$;

create or replace function public.admin_import_schools(p_rows jsonb, p_source text default 'import') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_my_region text := private.my_region(); v_admin boolean := private.is_platform_admin() or private.is_backend(); v_region text; r jsonb; v_ext text; v_inserted int := 0; v_updated int := 0; v_skipped int := 0; v_new boolean;
  v_attr text := case when p_source = 'osm' then '© OpenStreetMap contributors' else null end;
begin
  if not (private.is_executive() or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not v_admin and v_my_region is null then raise exception 'NO_REGION' using errcode = '42501'; end if;
  if p_source not in ('osm','import') then raise exception 'INVALID_SOURCE' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'INVALID_ROWS' using errcode = 'P0001'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(length(btrim(r->>'name')), 0) < 3 or (r->>'lat') is null or (r->>'lng') is null
       or (r->>'lat')::double precision not between -90 and 90 or (r->>'lng')::double precision not between -180 and 180 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_new := null;
    v_region := case when v_admin then coalesce(nullif(btrim(r->>'region'), ''), nullif(btrim(r->>'city'), '')) else v_my_region end;
    v_ext := coalesce(nullif(btrim(r->>'external_id'), ''), nullif(btrim(r->>'ministry_code'), ''),
                      md5(btrim(r->>'name') || round((r->>'lat')::numeric, 4) || round((r->>'lng')::numeric, 4)));
    insert into public.schools (name, district, city, region, ministry_code, latitude, longitude, status, source, external_id, source_attribution, created_by)
    values (btrim(r->>'name'), nullif(btrim(r->>'district'), ''), coalesce(nullif(btrim(r->>'city'), ''), v_region), v_region, nullif(btrim(r->>'ministry_code'), ''),
            (r->>'lat')::double precision, (r->>'lng')::double precision, 'unclaimed', p_source, v_ext, v_attr, null)
    on conflict (source, external_id) do update
      set name = excluded.name, district = coalesce(excluded.district, public.schools.district),
          city = coalesce(excluded.city, public.schools.city), ministry_code = coalesce(excluded.ministry_code, public.schools.ministry_code),
          latitude = excluded.latitude, longitude = excluded.longitude, source_attribution = excluded.source_attribution
      where v_admin or public.schools.region = v_my_region
    returning (xmax = 0) into v_new;
    if v_new is null then v_skipped := v_skipped + 1; v_new := null; continue; end if;
    if v_new then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
end $$;

create or replace function public.admin_review_claim(p_request uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.school_claim_requests;
begin
  if not private.is_executive_for((select school_id from public.school_claim_requests where id = p_request)) then
    raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('contacting','rejected','accepted') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_status = 'rejected' and coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.school_claim_requests set status = p_status, reject_reason = case when p_status = 'rejected' then btrim(p_reason) end,
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request returning * into c;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.audit(c.school_id, 'claim_' || p_status, 'school_claim_requests', p_request::text, null, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.activate_school(p_school uuid, p_admin_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.schools; v_email text := lower(btrim(p_admin_email)); v_user uuid; v_linked boolean := false; v_notified int := 0;
begin
  if not (private.is_executive_for(p_school) or private.is_backend()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
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

-- ───────── 4) أدوات مدير النظام ─────────
-- قائمة المستخدمين مع أدوارهم وعضوياتهم
create or replace function public.admin_list_users(p_query text default null)
returns table (user_id uuid, email text, full_name text, phone text, status text, email_confirmed boolean, created_at timestamptz,
               last_sign_in_at timestamptz, platform_roles jsonb, schools jsonb, is_driver boolean, is_guardian boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, p.full_name, p.phone, coalesce(p.status, 'pending'), u.email_confirmed_at is not null, u.created_at, u.last_sign_in_at,
    coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'region', r.region)) from public.user_roles r where r.user_id = u.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('school_id', m.school_id, 'school_name', s.name, 'role', m.role, 'status', m.status))
              from public.school_members m join public.schools s on s.id = m.school_id where m.user_id = u.id), '[]'::jsonb),
    exists (select 1 from public.drivers d where d.user_id = u.id),
    exists (select 1 from public.guardians g where g.user_id = u.id)
  from auth.users u left join public.profiles p on p.user_id = u.id
  where coalesce(btrim(p_query), '') = '' or u.email ilike '%' || btrim(p_query) || '%' or p.full_name ilike '%' || btrim(p_query) || '%'
  order by u.created_at desc
  limit 300;
end $$;

-- منح دور منصة أو سحبه. الإدارة التنفيذية تحتاج منطقة.
-- تعديل أي سجل (أعمدة محددة لكل جدول) — مدير النظام فقط، مع سجل تدقيق
create or replace function public.admin_update_record(p_table text, p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[]; k text; v_type text; v_old jsonb; v_school uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  v_allowed := case p_table
    when 'schools' then array['name','name_en','city','region','district','ministry_code','phone','email','contact_name','address','latitude','longitude','status','emergency_phone','stop_radius_m','default_pickup_time','default_dropoff_time']
    when 'students' then array['full_name','grade','class_name','home_address','home_latitude','home_longitude','pickup_contact_name','pickup_contact_phone','emergency_contact_name','emergency_contact_phone','service_status']
    when 'drivers' then array['full_name','phone','email','license_number','license_expiry','status']
    when 'guardians' then array['full_name','phone','email','status']
    when 'buses' then array['bus_number','plate_number','capacity','status','notes']
    when 'routes' then array['name','direction','scheduled_time','estimated_duration_minutes','is_active']
    when 'trips' then array['status','notes','trip_date']
    else null end;
  if v_allowed is null then raise exception 'INVALID_TABLE' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'INVALID_PATCH' using errcode = 'P0001'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table) into v_old using p_id;
  if v_old is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform set_config('masari.trusted', 'on', true);
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(v_allowed)) then raise exception 'COLUMN_NOT_ALLOWED: %', k using errcode = 'P0001'; end if;
    select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
      where a.attrelid = format('public.%I', p_table)::regclass and a.attname = k and not a.attisdropped;
    execute format('update public.%I set %I = nullif($1, %L)::%s where id = $2', p_table, k, '', v_type) using p_patch->>k, p_id;
  end loop;
  v_school := case when p_table = 'schools' then p_id else nullif(v_old->>'school_id', '')::uuid end;
  perform private.audit(v_school, 'admin_update', p_table, p_id::text, v_old, p_patch);
end $$;

revoke execute on function public.admin_school_directory(text, text), public.admin_list_users(text),
  public.admin_update_record(text, uuid, jsonb) from anon, public;
grant execute on function public.admin_school_directory(text, text), public.admin_list_users(text),
  public.admin_update_record(text, uuid, jsonb) to authenticated;

-- ───────── 5) my_access يعرض منطقة الإدارة التنفيذية ─────────
create or replace function public.my_access()
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'user_id', (select auth.uid()),
    'email', (select email from auth.users where id = (select auth.uid())),
    'email_confirmed', (select email_confirmed_at is not null from auth.users where id = (select auth.uid())),
    'status', coalesce((select status from public.profiles where user_id = (select auth.uid())), 'pending'),
    'full_name', (select full_name from public.profiles where user_id = (select auth.uid())),
    'platform_roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id = (select auth.uid())), '[]'::jsonb),
    'region', private.my_region(),
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
$function$;
