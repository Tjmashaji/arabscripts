-- تقييم السائق شهريًا من أولياء الأمور، وتقارير شهرية للمدرسة والإدارة التعليمية.

create table if not exists public.driver_ratings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  rated_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null default (date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date),
  stars smallint not null check (stars between 1 and 5),
  punctuality smallint check (punctuality between 1 and 5),
  safety smallint check (safety between 1 and 5),
  manners smallint check (manners between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (driver_id, rated_by, month)
);
create index if not exists driver_ratings_school_month on public.driver_ratings (school_id, month);
create index if not exists driver_ratings_rated_by on public.driver_ratings (rated_by);
alter table public.driver_ratings enable row level security;

-- ولي الأمر يقيّم فقط سائقًا ينقل أحد أبنائه
create or replace function private.guardian_rides_with(p_driver uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardians g join public.guardian_students gs on gs.guardian_id = g.id
    join public.student_route_assignments a on a.student_id = gs.student_id and a.status = 'active'
    join public.routes r on r.id = a.route_id
    where g.user_id = (select auth.uid()) and g.status = 'active' and r.driver_id = p_driver)
  or exists (
    select 1 from public.guardians g join public.guardian_students gs on gs.guardian_id = g.id
    join public.trip_students ts on ts.student_id = gs.student_id join public.trips t on t.id = ts.trip_id
    where g.user_id = (select auth.uid()) and t.driver_id = p_driver and t.trip_date >= private.riyadh_today() - 45)
$$;
revoke execute on function private.guardian_rides_with(uuid) from public, anon;
grant execute on function private.guardian_rides_with(uuid) to authenticated;

create policy driver_ratings_select on public.driver_ratings for select to authenticated
  using (rated_by = (select auth.uid()) or private.can_view_school(school_id));
create policy driver_ratings_insert on public.driver_ratings for insert to authenticated
  with check (rated_by = (select auth.uid()) and private.guardian_rides_with(driver_id));
create policy driver_ratings_update on public.driver_ratings for update to authenticated
  using (rated_by = (select auth.uid())) with check (rated_by = (select auth.uid()));
grant select, insert, update on public.driver_ratings to authenticated;

create or replace function private.prepare_driver_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select school_id into new.school_id from public.drivers where id = new.driver_id;
  new.month := date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date;
  return new;
end $$;
create or replace trigger driver_ratings_prepare before insert or update on public.driver_ratings
  for each row execute function private.prepare_driver_rating();

-- سائقو أبنائي مع تقييمي لهذا الشهر
create or replace function public.my_children_drivers()
returns table (driver_id uuid, full_name text, school_name text, students text, my_stars smallint, my_comment text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.full_name, s.name, string_agg(distinct st.full_name, '، '),
    (select dr.stars from public.driver_ratings dr where dr.driver_id = d.id and dr.rated_by = (select auth.uid()) and dr.month = date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date),
    (select dr.comment from public.driver_ratings dr where dr.driver_id = d.id and dr.rated_by = (select auth.uid()) and dr.month = date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date)
  from public.guardians g join public.guardian_students gs on gs.guardian_id = g.id
  join public.students st on st.id = gs.student_id
  join public.student_route_assignments a on a.student_id = st.id and a.status = 'active'
  join public.routes r on r.id = a.route_id join public.drivers d on d.id = r.driver_id
  join public.schools s on s.id = d.school_id
  where g.user_id = (select auth.uid()) and g.status = 'active'
  group by d.id, d.full_name, s.name
$$;
revoke execute on function public.my_children_drivers() from public, anon;
grant execute on function public.my_children_drivers() to authenticated;

-- ───────── التقرير الشهري للمدرسة ─────────
create or replace function public.school_monthly_report(p_school uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date; v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date; v jsonb;
begin
  if not private.can_view_school(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  with t as (
    select t.*, r.name as route_name, r.scheduled_time, d.full_name as driver_name,
      case when t.started_at is not null and r.scheduled_time is not null
        then extract(epoch from ((t.started_at at time zone 'Asia/Riyadh') - (t.trip_date + r.scheduled_time))) / 60 end as delay_min
    from public.trips t join public.routes r on r.id = t.route_id left join public.drivers d on d.id = t.driver_id
    where t.school_id = p_school and t.trip_date between v_from and v_to
  ), ts as (
    select ts.* from public.trip_students ts join t on t.id = ts.trip_id
  )
  select jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'school', (select name from public.schools where id = p_school),
    'totals', jsonb_build_object(
      'trips', (select count(*) from t where status <> 'cancelled'),
      'completed', (select count(*) from t where status = 'completed'),
      'cancelled', (select count(*) from t where status = 'cancelled'),
      'on_time_pct', (select round(100.0 * count(*) filter (where delay_min <= 10) / nullif(count(*) filter (where delay_min is not null), 0)) from t),
      'avg_delay_min', (select round(avg(greatest(delay_min, 0))::numeric, 1) from t where delay_min is not null),
      'rides', (select count(*) from ts where status not in ('absent')),
      'absences', (select count(*) from ts where status = 'absent'),
      'alerts', (select count(*) from public.trip_alerts a join t on t.id = a.trip_id),
      'emergencies', (select count(*) from public.emergency_reports e where e.school_id = p_school and (e.created_at at time zone 'Asia/Riyadh')::date between v_from and v_to),
      'vehicle_issues', (select count(*) from public.vehicle_checks c where c.school_id = p_school and c.check_date between v_from and v_to and not c.all_ok),
      'pickup_calls', (select count(*) from public.pickup_calls c where c.school_id = p_school and c.call_date between v_from and v_to and c.status = 'released'),
      'permissions', (select count(*) from public.student_permissions p where p.school_id = p_school and p.status = 'active' and p.from_date <= v_to and p.to_date >= v_from),
      'driver_rating', (select round(avg(stars)::numeric, 2) from public.driver_ratings dr where dr.school_id = p_school and dr.month = v_from),
      'students', (select count(*) from public.students s where s.school_id = p_school and s.service_status = 'active')),
    'routes', coalesce((select jsonb_agg(x order by x->>'route') from (
      select jsonb_build_object('route', route_name, 'trips', count(*) filter (where status <> 'cancelled'), 'completed', count(*) filter (where status = 'completed'),
        'on_time_pct', round(100.0 * count(*) filter (where delay_min <= 10) / nullif(count(*) filter (where delay_min is not null), 0)),
        'avg_delay_min', round(avg(greatest(delay_min, 0))::numeric, 1),
        'absences', (select count(*) from ts where ts.trip_id = any(array_agg(t.id)) and ts.status = 'absent')) as x
      from t group by route_name) q), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(x order by x->>'driver') from (
      select jsonb_build_object('driver', d.full_name, 'trips', (select count(*) from t where t.driver_id = d.id and t.status = 'completed'),
        'on_time_pct', (select round(100.0 * count(*) filter (where delay_min <= 10) / nullif(count(*) filter (where delay_min is not null), 0)) from t where t.driver_id = d.id),
        'rating', (select round(avg(stars)::numeric, 2) from public.driver_ratings dr where dr.driver_id = d.id and dr.month = v_from),
        'ratings_count', (select count(*) from public.driver_ratings dr where dr.driver_id = d.id and dr.month = v_from),
        'comments', (select jsonb_agg(dr.comment) from public.driver_ratings dr where dr.driver_id = d.id and dr.month = v_from and dr.comment is not null)) as x
      from public.drivers d where d.school_id = p_school and d.status = 'active') q), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(x order by x->>'day') from (
      select jsonb_build_object('day', to_char(trip_date, 'YYYY-MM-DD'), 'trips', count(*) filter (where status <> 'cancelled'),
        'on_time_pct', round(100.0 * count(*) filter (where delay_min <= 10) / nullif(count(*) filter (where delay_min is not null), 0)),
        'absences', (select count(*) from ts where ts.trip_id = any(array_agg(t.id)) and ts.status = 'absent')) as x
      from t group by trip_date) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function public.school_monthly_report(uuid, date) from public, anon;
grant execute on function public.school_monthly_report(uuid, date) to authenticated;

-- ───────── تقرير المنطقة: الإدارة التعليمية (منطقتها) ومدير النظام (الكل) ─────────
create or replace function public.region_monthly_report(p_month date)
returns table (school_id uuid, school_name text, region text, trips bigint, completed bigint, on_time_pct numeric, absences bigint, alerts bigint, emergencies bigint, vehicle_issues bigint, driver_rating numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date; v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (private.is_platform_admin() or private.is_executive()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select s.id, s.name, s.region,
    (select count(*) from public.trips t where t.school_id = s.id and t.trip_date between v_from and v_to and t.status <> 'cancelled'),
    (select count(*) from public.trips t where t.school_id = s.id and t.trip_date between v_from and v_to and t.status = 'completed'),
    (select round(100.0 * count(*) filter (where (t.started_at at time zone 'Asia/Riyadh') <= t.trip_date + r.scheduled_time + interval '10 minutes')
       / nullif(count(*) filter (where t.started_at is not null and r.scheduled_time is not null), 0))
     from public.trips t join public.routes r on r.id = t.route_id where t.school_id = s.id and t.trip_date between v_from and v_to),
    (select count(*) from public.trip_students ts join public.trips t on t.id = ts.trip_id where t.school_id = s.id and t.trip_date between v_from and v_to and ts.status = 'absent'),
    (select count(*) from public.trip_alerts a join public.trips t on t.id = a.trip_id where t.school_id = s.id and t.trip_date between v_from and v_to),
    (select count(*) from public.emergency_reports e where e.school_id = s.id and (e.created_at at time zone 'Asia/Riyadh')::date between v_from and v_to),
    (select count(*) from public.vehicle_checks c where c.school_id = s.id and c.check_date between v_from and v_to and not c.all_ok),
    (select round(avg(dr.stars)::numeric, 2) from public.driver_ratings dr where dr.school_id = s.id and dr.month = v_from)
  from public.schools s
  where s.status = 'active' and (private.is_platform_admin() or private.is_executive_for(s.id))
  order by s.name;
end $$;
revoke execute on function public.region_monthly_report(date) from public, anon;
grant execute on function public.region_monthly_report(date) to authenticated;
