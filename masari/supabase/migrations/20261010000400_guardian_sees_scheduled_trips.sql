-- ولي الأمر يرى رحلة ابنه المجدولة قبل بدئها (لعرض «الرحلة لم تبدأ بعد» وتسجيل الغياب).
-- قبل الإصلاح كانت الرؤية عبر trip_students فقط، وهي لا تُنشأ إلا عند بدء الرحلة.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated using (
  private.can_view_school(school_id)
  or driver_id = private.my_driver_id()
  or private.guardian_in_trip(id)
  or private.guardian_in_route(route_id)
);
