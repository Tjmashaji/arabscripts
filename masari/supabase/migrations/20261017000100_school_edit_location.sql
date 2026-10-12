-- مدير/مديرة المدرسة يعدّل موقع مدرسته (كان مقفلًا بعد أول حفظ). باقي أدوار المدرسة لا تعدّله.
create or replace function private.guard_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.trusted() and not private.is_platform_admin() then
    if new.status is distinct from old.status or new.created_by is distinct from old.created_by then
      raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
    end if;
    if old.latitude is not null and old.longitude is not null
       and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude)
       and not private.is_school_admin(new.id) then
      raise exception 'SCHOOL_LOCATION_LOCKED' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- تعديل الموقع مع خيار تحديث محطة المدرسة في كل المسارات (يُشعر أولياء الأمر عبر تنبيه تغيير المسار)
create or replace function public.school_set_location(p_school uuid, p_lat double precision, p_lng double precision,
  p_address text default null, p_update_stops boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_n integer := 0;
begin
  if not private.is_school_admin(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_LOCATION' using errcode = '22023';
  end if;
  select jsonb_build_object('latitude', latitude, 'longitude', longitude, 'address', address) into v_old
    from public.schools where id = p_school;
  update public.schools set latitude = p_lat, longitude = p_lng,
    address = coalesce(nullif(btrim(p_address), ''), address) where id = p_school;
  if p_update_stops then
    update public.route_stops rs set latitude = p_lat, longitude = p_lng
      from public.routes r
     where r.id = rs.route_id and r.school_id = p_school and rs.stop_type = 'school'
       and (rs.latitude is distinct from p_lat or rs.longitude is distinct from p_lng);
    get diagnostics v_n = row_count;
  end if;
  perform private.audit(p_school, 'school_location_changed', 'schools', p_school::text, v_old,
    jsonb_build_object('latitude', p_lat, 'longitude', p_lng, 'address', p_address, 'stops_updated', v_n));
  return v_n;
end $$;
revoke all on function public.school_set_location(uuid, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.school_set_location(uuid, double precision, double precision, text, boolean) to authenticated;
