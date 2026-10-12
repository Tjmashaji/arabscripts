-- الحذف التلقائي للبيانات القديمة (نظام حماية البيانات الشخصية). يُشغَّل يوميًا الساعة 03:15 بتوقيت الرياض.
-- منفصل لأنه يحتوي عمليات حذف؛ يُشغَّل من SQL Editor في Supabase.

create or replace function private.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_locations int; v_notes int; v_tracking int;
begin
  delete from public.vehicle_locations v using public.trips t
    where t.id = v.trip_id and t.trip_date < (now() at time zone 'Asia/Riyadh')::date - 90;
  get diagnostics v_locations = row_count;
  delete from public.notifications where created_at < now() - interval '180 days' and read_at is not null;
  get diagnostics v_notes = row_count;
  delete from private.trip_tracking k using public.trips t where t.id = k.trip_id and t.status in ('completed','cancelled');
  get diagnostics v_tracking = row_count;
  return jsonb_build_object('vehicle_locations', v_locations, 'notifications', v_notes, 'trip_tracking', v_tracking, 'at', now());
end $$;
revoke execute on function private.purge_expired_data() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('masari-purge-expired-data', '15 0 * * *', $$select private.purge_expired_data()$$)
where not exists (select 1 from cron.job where jobname = 'masari-purge-expired-data');
