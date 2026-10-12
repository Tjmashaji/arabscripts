-- يوم دراسي كامل لكل الأدوار. يُلغى كل شيء في النهاية (انظر README.md).
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); exr uuid := gen_random_uuid(); pr uuid := gen_random_uuid();
  dr uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; dreq uuid; sreq uuid; drv uuid; stu uuid; route uuid; rs1 uuid; rs2 uuid;
  trip uuid; trip2 uuid; ts1 uuid; ts2 uuid; em uuid; txt text;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-dev@example.com',now(),'authenticated','authenticated'),(ex,'zz-ex@example.com',now(),'authenticated','authenticated'),
    (exr,'zz-exr@example.com',now(),'authenticated','authenticated'),(pr,'zz-principal@example.com',now(),'authenticated','authenticated'),
    (dr,'zz-driver@example.com',now(),'authenticated','authenticated'),(pa,'zz-parent@example.com',now(),'authenticated','authenticated'),
    (pb,'zz-other@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) values (dev,'مطور','active'),(ex,'تعليم الخرج','pending'),(exr,'تعليم الرياض','pending'),
    (pr,'مدير','pending'),(dr,'سائق','pending'),(pa,'ولي أمر','pending'),(pb,'آخر','pending') on conflict (user_id) do update set status = excluded.status;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_set_platform_role(ex,'executive',true,'الخرج'); perform public.admin_set_platform_role(exr,'executive',true,'الرياض');
    out := array_append(out,'PASS 1 مدير النظام عيّن إدارة الخرج والرياض');
  exception when others then out := array_append(out,'FAIL 1 '||sqlerrm); end;
  begin perform public.admin_set_platform_role(pb,'executive',true,null); out := array_append(out,'FAIL 1b قبل إدارة بلا منطقة');
  exception when others then out := array_append(out,'PASS 1b رفض إدارة تنفيذية بلا منطقة'); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  begin v := public.admin_add_school('ابتدائية اختبار مساري', 'السيح', 'الخرج', null, 24.1500, 47.3100, null, true); sch := (v->>'id')::uuid;
    out := array_append(out,'PASS 2 الإدارة أضافت مدرسة للدليل');
  exception when others then out := array_append(out,'FAIL 2 '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'أحمد','مدير','0500000000','zz-principal@example.com');
    out := array_append(out,'PASS 3 طلب تفعيل من مسؤول المدرسة');
  exception when others then out := array_append(out,'FAIL 3 '||sqlerrm); end;
  begin insert into public.students (school_id, full_name) values (sch,'قبل التفعيل'); out := array_append(out,'FAIL 3b أضاف طالبًا لمدرسة غير مفعلة');
  exception when others then out := array_append(out,'PASS 3b منع إضافة طالب قبل التفعيل'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',exr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.activate_school(sch,'zz-principal@example.com'); out := array_append(out,'FAIL 4a إدارة الرياض فعّلت مدرسة الخرج');
  exception when others then out := array_append(out,'PASS 4a إدارة الرياض لا تفعّل مدرسة الخرج'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  begin v := public.activate_school(sch,'zz-principal@example.com'); out := array_append(out,'PASS 4 تفعيل المدرسة وربط المدير='||(v->>'linked_now'));
  exception when others then out := array_append(out,'FAIL 4 '||sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 1234',30) returning id into bus;
    insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status) values (sch, pr, 'سائق اختبار','0511111111','zz-driver@example.com','pending') returning id into dreq;
    perform public.review_driver_request(dreq, true, null, bus);
    out := array_append(out,'PASS 5 باص + اعتماد سائق');
  exception when others then out := array_append(out,'FAIL 5 '||sqlerrm); end;
  begin insert into public.student_onboarding_requests (school_id, created_by, student_name, grade, parent_name, parent_phone, parent_email, home_address, status)
      values (sch, pr, 'طالب اختبار','الثالث','ولي أمر','0522222222','zz-parent@example.com','السيح','pending_parent_account') returning id into sreq;
    stu := public.review_student_request(sreq, true, null);
    out := array_append(out,'PASS 6 اعتماد طالب وإنشاء سجل ولي أمره');
  exception when others then out := array_append(out,'FAIL 6 '||sqlerrm); end;
  begin select id into drv from public.drivers where school_id=sch limit 1;
    insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id) values (sch,'مسار السيح','to_school','06:30', bus, drv) returning id into route;
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,1,'منزل الطالب','pickup',24.1600,47.3000) returning id into rs1;
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,2,'المدرسة','school',24.1500,47.3100) returning id into rs2;
    insert into public.student_route_assignments (student_id, route_id, stop_id) values (stu, route, rs1);
    insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status, trip_date) values (sch, route, bus, drv,'to_school','scheduled', private.riyadh_today()) returning id into trip;
    out := array_append(out,'PASS 7 مسار + إسناد + رحلة اليوم');
  exception when others then out := array_append(out,'FAIL 7 '||sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  v := public.claim_my_invites(); v := public.my_access(); out := array_append(out,(case when v->>'status'='active' then 'PASS' else 'FAIL' end)||' 8 ربط السائق تلقائيًا');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  v := public.claim_my_invites(); select count(*) into n from public.students where id = stu; out := array_append(out,(case when n=1 then 'PASS' else 'FAIL' end)||' 9 ربط ولي الأمر ويرى ابنه');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.submit_vehicle_check(trip, '{"الإطارات":true}'::jsonb); v := public.start_trip(trip); out := array_append(out,'PASS 10 بدء الرحلة'); exception when others then out := array_append(out,'FAIL 10 '||sqlerrm); end;
  select id into ts1 from public.trip_stops where trip_id=trip and stop_order=1; select id into ts2 from public.trip_stops where trip_id=trip and stop_order=2;
  begin perform public.record_attendance(trip, stu, 'boarded','manual',24.17,47.29,null,null); out := array_append(out,'FAIL 11a صعود قبل الوصول');
  exception when others then out := array_append(out,'PASS 11a منع الصعود قبل اعتماد المحطة'); end;
  begin perform public.arrive_at_stop(trip, ts1, 24.2000, 47.3000, 10); out := array_append(out,'FAIL 11b اعتماد من بعيد');
  exception when others then out := array_append(out,'PASS 11b رفض الاعتماد من 4.4 كم'); end;
  begin perform public.arrive_at_stop(trip, ts2, 24.1500, 47.3100, 10); out := array_append(out,'FAIL 11c قفز محطة');
  exception when others then out := array_append(out,'PASS 11c منع تجاوز ترتيب المحطات'); end;
  begin perform public.arrive_at_stop(trip, ts1, 24.1601, 47.3001, 500); out := array_append(out,'FAIL 11d دقة ضعيفة');
  exception when others then out := array_append(out,'PASS 11d رفض دقة GPS ضعيفة'); end;
  begin insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (trip, 24.1601, 47.3001, 8);
    perform public.arrive_at_stop(trip, ts1, 24.1601, 47.3001, 8); perform public.record_attendance(trip, stu, 'boarded','manual',24.1601,47.3001,null,null);
    out := array_append(out,'PASS 11 اعتماد المحطة وصعود الطالب');
  exception when others then out := array_append(out,'FAIL 11 '||sqlerrm); end;
  begin perform public.report_emergency(trip,'delay','زحام',24.155,47.305); out := array_append(out,'PASS 12 بلاغ من السائق');
  exception when others then out := array_append(out,'FAIL 12 '||sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.vehicle_locations where trip_id=trip; out := array_append(out,(case when n>0 then 'PASS' else 'FAIL' end)||' 13 ولي الأمر يرى موقع الباص أثناء الرحلة');
  begin perform public.record_attendance(trip, stu, 'arrived_school','manual',null,null,null,null); out := array_append(out,'FAIL 13b ولي الأمر سجل حضورًا');
  exception when others then out := array_append(out,'PASS 13b ولي الأمر لا يسجل الحضور'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pb,'role','authenticated')::text, true); set local role authenticated;
  select (select count(*) from public.vehicle_locations where trip_id=trip)+(select count(*) from public.students where id=stu)+(select count(*) from public.trips where id=trip) into n;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' 14 مستخدم غريب لا يرى شيئًا');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',exr,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.live_trips() where trip_id=trip; out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' 15 إدارة الرياض لا ترى رحلة الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin select id into em from public.emergency_reports where trip_id=trip limit 1; perform public.update_emergency(em,'resolved','تم');
    out := array_append(out,'PASS 16 المدرسة أغلقت البلاغ');
  exception when others then out := array_append(out,'FAIL 16 '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.complete_trip(trip, true); out := array_append(out,'FAIL 17a إنهاء قبل آخر محطة');
  exception when others then out := array_append(out,'PASS 17a منع إنهاء الرحلة قبل آخر محطة'); end;
  begin perform public.arrive_at_stop(trip, ts2, 24.1500, 47.3100, 12); perform public.complete_trip(trip, true);
    out := array_append(out,'PASS 17 إنهاء الرحلة: الطالب='||(select status from public.trip_students where trip_id=trip and student_id=stu));
  exception when others then out := array_append(out,'FAIL 17 '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.vehicle_locations where trip_id=trip; out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' 18 لا موقع لولي الأمر بعد انتهاء الرحلة');
  select string_agg(type, '، ' order by created_at) into txt from public.notifications where user_id=pa; out := array_append(out,'INFO إشعارات ولي الأمر: '||coalesce(txt,'لا شيء'));
  reset role;
  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
