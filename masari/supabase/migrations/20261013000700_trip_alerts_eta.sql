-- تنبيهات الرحلة من موقع الباص (تعمل في الخادم مع كل نقطة GPS يرسلها السائق):
-- 1) «الباص على بعد 5 دقائق» لولي أمر كل طالب ينتظر في محطته (أو ينتظر نزوله عند المنزل).
-- 2) خروج الباص عن المسار أكثر من 3 دقائق، أو توقفه الطويل خارج المحطات: تنبيه في برج المراقبة وإشعار للمدرسة.

create table if not exists public.trip_alerts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  type text not null check (type in ('off_route','long_stop')),
  status text not null default 'open' check (status in ('open','resolved')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  latitude double precision, longitude double precision,
  max_distance_m integer,
  acknowledged_by uuid references auth.users(id),
  note text check (note is null or length(note) <= 500)
);
create index if not exists trip_alerts_trip_idx on public.trip_alerts (trip_id, status);
create index if not exists trip_alerts_school_idx on public.trip_alerts (school_id, started_at desc);
create unique index if not exists trip_alerts_one_open on public.trip_alerts (trip_id, type) where status = 'open';
alter table public.trip_alerts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='trip_alerts' and policyname='trip_alerts_select') then
    create policy trip_alerts_select on public.trip_alerts for select to authenticated using (private.can_view_school(school_id));
  end if;
end $$;
revoke all on table public.trip_alerts from anon;

-- حالة التتبع لكل رحلة (لا يقرؤها المستخدمون مباشرة)
create table if not exists private.trip_tracking (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  off_route_since timestamptz,
  still_since timestamptz,
  still_lat double precision, still_lng double precision,
  updated_at timestamptz not null default now()
);

-- المسافة بين نقطة وقطعة مستقيمة (بالأمتار، إسقاط محلي مناسب للمسافات القصيرة)
create or replace function private.point_segment_m(plat double precision, plng double precision,
  alat double precision, alng double precision, blat double precision, blng double precision) returns double precision
language sql immutable set search_path = '' as $$
  with k as (select cos(radians(plat)) * 111320.0 as kx, 110540.0 as ky),
  v as (select (blng - alng) * kx as bx, (blat - alat) * ky as by, (plng - alng) * kx as px, (plat - alat) * ky as py from k),
  t as (select bx, by, px, py, case when bx*bx + by*by = 0 then 0 else greatest(0, least(1, (px*bx + py*by) / (bx*bx + by*by))) end as u from v)
  select sqrt(power(px - u*bx, 2) + power(py - u*by, 2)) from t
$$;

-- بعد الباص عن خط المسار، مع هامش يتسع مع طول المقطع (الطرق لا تمشي بخط مستقيم بين المحطات)
create or replace function private.route_corridor_excess(p_trip uuid, p_lat double precision, p_lng double precision) returns double precision
language sql stable security definer set search_path = '' as $$
  with s as (
    select latitude as lat, longitude as lng, lead(latitude) over w as lat2, lead(longitude) over w as lng2
    from public.trip_stops where trip_id = p_trip and latitude is not null window w as (order by stop_order)
  )
  select min(private.point_segment_m(p_lat, p_lng, lat, lng, coalesce(lat2, lat), coalesce(lng2, lng))
             - (300 + least(0.25 * private.distance_m(lat, lng, coalesce(lat2, lat), coalesce(lng2, lng)), 1200)))
  from s
$$;

create or replace function private.process_vehicle_location() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips; st private.trip_tracking; v_excess double precision; v_known boolean; v_near_stop boolean;
  v_speed double precision; r record; v_eta_min double precision; v_alert uuid;
begin
  select * into t from public.trips where id = new.trip_id;
  if not found or t.status not in ('in_progress','paused','emergency') then return new; end if;
  insert into private.trip_tracking (trip_id) values (new.trip_id) on conflict (trip_id) do nothing;
  select * into st from private.trip_tracking where trip_id = new.trip_id for update;

  -- ── 1) خارج المسار؟ (خارج الممر الهندسي وليس على طريق سلكته رحلات سابقة لنفس المسار)
  v_excess := private.route_corridor_excess(new.trip_id, new.latitude, new.longitude);
  if v_excess is not null and v_excess > 0 then
    select exists (
      select 1 from public.trips t2 join public.vehicle_locations v on v.trip_id = t2.id
      where t2.route_id = t.route_id and t2.id <> t.id and t2.status = 'completed' and t2.trip_date >= t.trip_date - 30
        and v.latitude between new.latitude - 0.0015 and new.latitude + 0.0015
        and v.longitude between new.longitude - 0.0015 and new.longitude + 0.0015
        and private.distance_m(v.latitude, v.longitude, new.latitude, new.longitude) < 150) into v_known;
  end if;
  if v_excess is not null and v_excess > 0 and not coalesce(v_known, false) then
    if st.off_route_since is null then
      update private.trip_tracking set off_route_since = new.created_at where trip_id = new.trip_id;
    elsif new.created_at - st.off_route_since >= interval '3 minutes' then
      insert into public.trip_alerts (trip_id, school_id, type, started_at, latitude, longitude, max_distance_m)
        values (t.id, t.school_id, 'off_route', st.off_route_since, new.latitude, new.longitude, round(v_excess + 300))
        on conflict (trip_id, type) where status = 'open'
        do update set max_distance_m = greatest(public.trip_alerts.max_distance_m, excluded.max_distance_m), latitude = excluded.latitude, longitude = excluded.longitude
        returning id into v_alert;
      perform private.notify_school_staff(t.school_id, 'off_route', 'باص خرج عن مساره',
        'خرج الباص عن مساره منذ أكثر من 3 دقائق. تابعه من برج المراقبة.', 'off_route:' || v_alert, jsonb_build_object('trip_id', t.id, 'alert_id', v_alert));
    end if;
  else
    if st.off_route_since is not null then update private.trip_tracking set off_route_since = null where trip_id = new.trip_id; end if;
    update public.trip_alerts set status = 'resolved', resolved_at = new.created_at where trip_id = t.id and type = 'off_route' and status = 'open';
  end if;

  -- ── 2) توقف طويل خارج المحطات (أكثر من 7 دقائق ضمن 40م، وبعيدًا عن أي محطة بأكثر من 200م)
  if st.still_lat is null or private.distance_m(st.still_lat, st.still_lng, new.latitude, new.longitude) > 40 then
    update private.trip_tracking set still_since = new.created_at, still_lat = new.latitude, still_lng = new.longitude where trip_id = new.trip_id;
    update public.trip_alerts set status = 'resolved', resolved_at = new.created_at where trip_id = t.id and type = 'long_stop' and status = 'open';
  elsif new.created_at - st.still_since >= interval '7 minutes' then
    select exists (select 1 from public.trip_stops x where x.trip_id = t.id and x.latitude is not null
                   and private.distance_m(x.latitude, x.longitude, new.latitude, new.longitude) < 200) into v_near_stop;
    if not v_near_stop then
      insert into public.trip_alerts (trip_id, school_id, type, started_at, latitude, longitude)
        values (t.id, t.school_id, 'long_stop', st.still_since, new.latitude, new.longitude)
        on conflict (trip_id, type) where status = 'open' do nothing returning id into v_alert;
      if v_alert is not null then
        perform private.notify_school_staff(t.school_id, 'long_stop', 'توقف طويل للباص',
          'الباص متوقف منذ أكثر من 7 دقائق خارج المحطات.', 'long_stop:' || v_alert, jsonb_build_object('trip_id', t.id, 'alert_id', v_alert));
      end if;
    end if;
  end if;
  update private.trip_tracking set updated_at = new.created_at where trip_id = new.trip_id;

  -- ── 3) «الباص على بعد 5 دقائق»: المسافة × 1.4 (الطرق) ÷ السرعة (الفعلية إن كانت معقولة، وإلا 25 كم/س)
  v_speed := case when new.speed is not null and new.speed between 3 and 25 then new.speed else 7.0 end;
  for r in
    select ts.student_id, x.label, x.latitude, x.longitude, ts.status
    from public.trip_students ts join public.trip_stops x on x.id = ts.trip_stop_id
    where ts.trip_id = t.id and x.status = 'pending' and x.latitude is not null
      and ((t.direction = 'to_school' and ts.status in ('not_boarded','waiting'))
        or (t.direction = 'to_home' and ts.status = 'boarded_return'))
  loop
    v_eta_min := private.distance_m(new.latitude, new.longitude, r.latitude, r.longitude) * 1.4 / v_speed / 60.0;
    if v_eta_min <= 5 then
      perform private.notify_student_guardians(r.student_id, 'bus_eta', 'bus_approaching',
        case when t.direction = 'to_school' then 'الباص على بعد 5 دقائق تقريبًا' else 'ابنك يصل المنزل خلال 5 دقائق تقريبًا' end,
        case when t.direction = 'to_school' then 'جهّز ابنك في محطة ' || r.label || '.' else 'الباص يقترب من ' || r.label || '.' end,
        'eta5:' || t.id || ':' || r.student_id, jsonb_build_object('trip_id', t.id, 'eta_minutes', round(v_eta_min::numeric, 1)));
    end if;
  end loop;
  return new;
end $$;

create or replace trigger vehicle_locations_process after insert on public.vehicle_locations
  for each row execute function private.process_vehicle_location();

-- إقرار المدرسة بالتنبيه وإغلاقه بملاحظة
create or replace function public.resolve_trip_alert(p_alert uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.trip_alerts;
begin
  select * into a from public.trip_alerts where id = p_alert;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (private.is_school_staff(a.school_id) or private.is_executive_for(a.school_id)) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.trip_alerts set status = 'resolved', resolved_at = coalesce(resolved_at, now()), acknowledged_by = (select auth.uid()),
    note = nullif(btrim(p_note), '') where id = p_alert;
  perform private.audit(a.school_id, 'trip_alert_resolved', 'trip_alerts', p_alert::text, null, jsonb_build_object('note', p_note));
end $$;
revoke execute on function public.resolve_trip_alert(uuid, text) from anon, public;
grant execute on function public.resolve_trip_alert(uuid, text) to authenticated;
