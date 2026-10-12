-- تقوية قبل الإطلاق: وقت نقطة GPS يرسلها الجوال (للنقاط المحفوظة دون إنترنت) لا يتجاوز الآن ولا يسبقه بأكثر من 12 ساعة.
create or replace function private.fill_vehicle_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.school_id, t.driver_id, t.bus_id into new.school_id, new.driver_id, new.bus_id
    from public.trips t where t.id = new.trip_id;
  new.created_at := now();
  new.recorded_at := least(greatest(coalesce(new.recorded_at, now()), now() - interval '12 hours'), now());
  return new;
end $$;
