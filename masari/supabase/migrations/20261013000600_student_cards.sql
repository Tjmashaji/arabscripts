-- بطاقة الطالب: رمز QR فريد (students.qr_token) يمسحه السائق عند الصعود والنزول.
-- البطاقة المفقودة تُستبدل بإصدار رمز جديد، فتتوقف البطاقة القديمة فورًا.

create or replace function public.reissue_student_card(p_student uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_token uuid := gen_random_uuid();
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(v_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform set_config('masari.trusted', 'on', true);
  update public.students set qr_token = v_token where id = p_student;
  perform private.audit(v_school, 'card_reissued', 'students', p_student::text, null, null);
  return v_token;
end $$;
revoke execute on function public.reissue_student_card(uuid) from anon, public;
grant execute on function public.reissue_student_card(uuid) to authenticated;

-- المسح الثاني لبطاقة طالب صعد الباص يعني «وصل المدرسة» فقط بعد وصول الباص فعليًا لمحطة المدرسة،
-- وإلا يُعدّ تكرارًا (يمنع تسجيل وصول خاطئ عند مسح البطاقة مرتين في محطة الصعود).
create or replace function public.record_attendance_qr(p_trip uuid, p_qr text, p_lat double precision default null, p_lng double precision default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_token uuid; v_student uuid; v_status text; v_event text;
begin
  select * into t from public.trips where id = p_trip;
  if not found or not (private.is_trip_driver(p_trip) or private.is_school_staff(t.school_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_token := regexp_replace(btrim(p_qr), '^masari:qr:', '')::uuid;
  exception when others then
    perform private.audit(t.school_id, 'qr_rejected', 'trip_students', null, null, jsonb_build_object('trip_id', p_trip, 'reason', 'malformed'));
    raise exception 'QR_INVALID' using errcode = 'P0001';
  end;
  select ts.student_id, ts.status into v_student, v_status
    from public.trip_students ts join public.students s on s.id = ts.student_id
    where ts.trip_id = p_trip and s.qr_token = v_token;
  if v_student is null then
    perform private.audit(t.school_id, 'qr_rejected', 'trip_students', null, null, jsonb_build_object('trip_id', p_trip, 'reason', 'not_in_trip'));
    raise exception 'QR_NOT_IN_TRIP' using errcode = 'P0001';
  end if;
  v_event := case
    when t.direction = 'to_school' and v_status in ('not_boarded','waiting') then 'boarded'
    when t.direction = 'to_school' and v_status = 'boarded'
         and exists (select 1 from public.trip_stops x where x.trip_id = p_trip and x.stop_type = 'school' and x.status = 'arrived') then 'arrived_school'
    when t.direction = 'to_home' and v_status in ('not_boarded','waiting') then 'boarded_return'
    when t.direction = 'to_home' and v_status = 'boarded_return' then 'dropped_home'
    else null end;
  if v_event is null then raise exception 'ALREADY_RECORDED' using errcode = 'P0001'; end if;
  perform private.audit(t.school_id, 'qr_scan', 'trip_students', v_student::text, null, jsonb_build_object('trip_id', p_trip, 'event', v_event));
  return public.record_attendance(p_trip, v_student, v_event, 'qr', p_lat, p_lng, p_device, null);
end $$;
