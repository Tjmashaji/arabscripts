-- شغّل هذا الملف كاملًا في Supabase → SQL Editor (مرة واحدة).
-- 1) يسمح بأكثر من رحلة في اليوم لنفس الباص والسائق (منع التداخل مطبّق مسبقًا بحارس المسارات).
drop index if exists public.trips_driver_day;
drop index if exists public.trips_bus_day;

-- 2) دمج المحطات في عملية واحدة
-- دمج المحطات القريبة في نقطة تجمع، في عملية واحدة: توسيط موقع المحطة الباقية وتسميتها، ثم نقل الطلاب إليها، ثم حذف المدموجة وإعادة الترقيم.
-- p_groups: [{keep: uuid, merge: [uuid]}]
create or replace function public.school_merge_stops(p_route uuid, p_groups jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.routes; g jsonb; v_keep uuid; v_merge uuid[]; n int := 0;
begin
  select * into r from public.routes where id = p_route for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  for g in select * from jsonb_array_elements(coalesce(p_groups, '[]')) loop
    v_keep := (g->>'keep')::uuid;
    select array_agg(x::uuid) into v_merge from jsonb_array_elements_text(coalesce(g->'merge', '[]')) x;
    if v_merge is null or v_keep = any(v_merge)
       or (select count(*) from public.route_stops where route_id = p_route and stop_type <> 'school' and (id = v_keep or id = any(v_merge))) <> array_length(v_merge, 1) + 1 then
      raise exception 'INVALID_STOPS' using errcode = 'P0001';
    end if;
    update public.route_stops k set
        latitude = round(c.lat::numeric, 6), longitude = round(c.lng::numeric, 6),
        label = case when k.label like 'نقطة تجمع%' then k.label else 'نقطة تجمع: ' || k.label end
      from (select avg(latitude) lat, avg(longitude) lng from public.route_stops where id = v_keep or id = any(v_merge)) c
      where k.id = v_keep;
    -- بعد تسمية نقطة التجمع، حتى يصل ولي الأمر اسمها الجديد
    update public.student_route_assignments set stop_id = v_keep where route_id = p_route and stop_id = any(v_merge);
    delete from public.route_stops where route_id = p_route and id = any(v_merge);
    n := n + array_length(v_merge, 1);
  end loop;
  -- إعادة الترقيم بلا فجوات (القيد مؤجل حتى نهاية المعاملة)
  update public.route_stops s set stop_order = o.rn
    from (select id, row_number() over (order by stop_order) rn from public.route_stops where route_id = p_route) o
    where s.id = o.id and s.stop_order <> o.rn;
  if n > 0 then perform private.audit(r.school_id, 'stops_merged', 'routes', p_route::text, null, jsonb_build_object('merged', n)); end if;
  return n;
end $$;
revoke execute on function public.school_merge_stops(uuid, jsonb) from public, anon;
grant execute on function public.school_merge_stops(uuid, jsonb) to authenticated;
