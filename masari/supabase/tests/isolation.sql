-- عزل البيانات بين مدرستين، ومحاولات تجاوز الصلاحيات، وحالات الرحلة الحرجة. يُلغى كل شيء في النهاية (انظر README.md).
-- مدرستان (أ، ب) في نفس المنطقة، لكل منهما مدير وسائق وولي أمر وطالب ومسار ذهاب ومسار عودة ورحلتان اليوم.
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  pr uuid[] := array[gen_random_uuid(), gen_random_uuid()]; dr uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  pa uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  sch uuid[] := '{}'; bus uuid[] := '{}'; drv uuid[] := '{}'; stu uuid[] := '{}'; trip uuid[] := '{}'; rtrip uuid[] := '{}';
  out text[] := '{}'; v jsonb; n int; i int; tag text; s uuid; b uuid; d uuid; st uuid; r uuid; rr uuid; h uuid; sc uuid; t uuid; ts1 uuid; ts2 uuid; x text;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-iso-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-iso-ex@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-iso-stranger@example.com',now(),'authenticated','authenticated');
  for i in 1..2 loop
    tag := case i when 1 then 'a' else 'b' end;
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (pr[i],'zz-iso-pr-'||tag||'@example.com',now(),'authenticated','authenticated'),
      (dr[i],'zz-iso-dr-'||tag||'@example.com',now(),'authenticated','authenticated'),
      (pa[i],'zz-iso-pa-'||tag||'@example.com',now(),'authenticated','authenticated');
  end loop;
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, stranger] || pr || dr || pa) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  for i in 1..2 loop
    tag := case i when 1 then 'a' else 'b' end;
    perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
    v := public.admin_add_school('مدرسة عزل '||tag, 'السيح', 'الخرج', null, 24.15 + i*0.01, 47.31, null, true); s := (v->>'id')::uuid;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub',pr[i],'role','authenticated')::text, true); set local role authenticated;
    insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (s,'مدير '||tag,'مدير','0500000000','zz-iso-pr-'||tag||'@example.com');
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
    perform public.activate_school(s,'zz-iso-pr-'||tag||'@example.com');
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub',pr[i],'role','authenticated')::text, true); set local role authenticated;
    insert into public.buses (school_id, bus_number, plate_number, capacity) values (s,'B-'||tag,'أ ب ج 12'||i,30) returning id into b;
    insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
      values (s, pr[i], 'سائق '||tag,'051111111'||i,'zz-iso-dr-'||tag||'@example.com','pending') returning id into x;
    perform public.review_driver_request(x::uuid, true, null, b);
    insert into public.student_onboarding_requests (school_id, created_by, student_name, grade, parent_name, parent_phone, parent_email, home_address, status)
      values (s, pr[i], 'طالب '||tag,'الثالث','ولي '||tag,'052222222'||i,'zz-iso-pa-'||tag||'@example.com','السيح','pending_parent_account') returning id into x;
    st := public.review_student_request(x::uuid, true, null);
    select id into d from public.drivers where school_id = s limit 1;
    -- ذهاب: المنزل ← المدرسة
    insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id) values (s,'ذهاب '||tag,'to_school','06:30', b, d) returning id into r;
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (r,1,'منزل '||tag,'pickup',24.16 + i*0.01,47.30) returning id into h;
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (r,2,'المدرسة','school',24.15 + i*0.01,47.31);
    insert into public.student_route_assignments (student_id, route_id, stop_id) values (st, r, h);
    insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status, trip_date) values (s, r, b, d,'to_school','scheduled', private.riyadh_today()) returning id into t;
    trip := trip || t;
    -- عودة: المدرسة ← المنزل
    insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id) values (s,'عودة '||tag,'to_home','13:00', b, d) returning id into rr;
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rr,1,'المدرسة','school',24.15 + i*0.01,47.31);
    insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rr,2,'منزل '||tag,'dropoff',24.16 + i*0.01,47.30) returning id into h;
    insert into public.student_route_assignments (student_id, route_id, stop_id) values (st, rr, h);
    insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status, trip_date) values (s, rr, b, d,'to_home','scheduled', private.riyadh_today()) returning id into t;
    rtrip := rtrip || t;
    reset role;
    sch := sch || s; bus := bus || b; drv := drv || d; stu := stu || st;
    perform set_config('request.jwt.claims', json_build_object('sub',dr[i],'role','authenticated')::text, true); set local role authenticated;
    v := public.claim_my_invites();
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub',pa[i],'role','authenticated')::text, true); set local role authenticated;
    v := public.claim_my_invites();
    reset role;
  end loop;
  out := array_append(out, 'INFO التجهيز: مدرستان، لكل منهما مدير وسائق وولي أمر وطالب ورحلة ذهاب ورحلة عودة');

  -- بدء رحلة ذهاب المدرسة ب ليكون فيها موقع مباشر
  perform set_config('request.jwt.claims', json_build_object('sub',dr[2],'role','authenticated')::text, true); set local role authenticated;
  perform public.submit_vehicle_check(trip[2], '{"الإطارات":true}'::jsonb); perform public.start_trip(trip[2]);
  insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (trip[2], 24.1701, 47.3001, 8);
  reset role;

  -- ───────── أ) مدير المدرسة أ مقابل بيانات المدرسة ب ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',pr[1],'role','authenticated')::text, true); set local role authenticated;
  select (select count(*) from public.students where school_id=sch[2]) + (select count(*) from public.buses where school_id=sch[2])
       + (select count(*) from public.drivers where school_id=sch[2]) + (select count(*) from public.routes where school_id=sch[2])
       + (select count(*) from public.trips where school_id=sch[2]) + (select count(*) from public.guardians where school_id=sch[2]) into n;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' A1 مدير المدرسة أ لا يرى طلاب ولا باصات ولا سائقي ولا مسارات ولا رحلات المدرسة ب ('||n||')');
  select count(*) into n from public.vehicle_locations where trip_id=trip[2];
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' A2 مدير المدرسة أ لا يرى موقع باص المدرسة ب');
  update public.students set full_name='مخترق' where id=stu[2]; get diagnostics n = row_count;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' A3 مدير المدرسة أ لا يعدّل طالب المدرسة ب');
  delete from public.buses where id=bus[2]; get diagnostics n = row_count;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' A4 مدير المدرسة أ لا يحذف باص المدرسة ب');
  begin insert into public.students (school_id, full_name) values (sch[2],'مدسوس'); out := array_append(out,'FAIL A5 أضاف طالبًا في المدرسة ب');
  exception when others then out := array_append(out,'PASS A5 مدير المدرسة أ لا يضيف طالبًا في المدرسة ب'); end;
  begin update public.students set school_id=sch[2] where id=stu[1];
    select count(*) into n from public.students where id=stu[1] and school_id=sch[2];
    out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' A6 لا يمكن نقل طالب إلى مدرسة أخرى بتغيير school_id');
  exception when others then out := array_append(out,'PASS A6 لا يمكن نقل طالب إلى مدرسة أخرى بتغيير school_id'); end;
  begin perform public.record_attendance(trip[2], stu[2], 'boarded','manual',null,null,null,null); out := array_append(out,'FAIL A7 سجّل حضورًا في رحلة المدرسة ب');
  exception when others then out := array_append(out,'PASS A7 مدير المدرسة أ لا يسجل حضورًا في رحلة المدرسة ب'); end;
  reset role;

  -- ───────── ب) ولي الأمر ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',pa[1],'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.students; select count(*) into i from public.students where id=stu[1];
  out := array_append(out,(case when n=1 and i=1 then 'PASS' else 'FAIL' end)||' B1 ولي الأمر يرى ابنه فقط ('||n||' طالب)');
  select count(*) into n from public.vehicle_locations where trip_id=trip[2];
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' B2 ولي الأمر لا يرى موقع باص ليس فيه ابنه');
  begin perform public.guardian_set_absence(rtrip[2], stu[2], true); out := array_append(out,'FAIL B3 سجّل غياب طالب ليس ابنه');
  exception when others then out := array_append(out,'PASS B3 ولي الأمر لا يسجل غياب طالب ليس ابنه'); end;
  begin insert into public.guardian_students (guardian_id, student_id) select g.id, stu[2] from public.guardians g where g.user_id = pa[1] limit 1;
    select count(*) into n from public.students where id=stu[2];
    out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' B4 ولي الأمر لا يربط نفسه بطالب آخر');
  exception when others then out := array_append(out,'PASS B4 ولي الأمر لا يربط نفسه بطالب آخر'); end;
  begin perform public.guardian_set_absence(rtrip[1], stu[1], true); select status into x from public.trip_students where trip_id=rtrip[1] and student_id=stu[1];
    out := array_append(out,(case when x='absent' then 'PASS' else 'FAIL' end)||' B5 ولي الأمر يسجل غياب ابنه قبل الرحلة');
  exception when others then out := array_append(out,'FAIL B5 '||sqlerrm); end;
  begin perform public.guardian_set_absence(rtrip[1], stu[1], false); exception when others then null; end;
  reset role;

  -- ───────── ج) السائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dr[1],'role','authenticated')::text, true); set local role authenticated;
  select (select count(*) from public.students where school_id=sch[2]) + (select count(*) from public.trips where school_id=sch[2]) into n;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' C1 سائق المدرسة أ لا يرى طلاب ولا رحلات المدرسة ب');
  begin insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (trip[2], 24.0, 47.0, 5); out := array_append(out,'FAIL C2 أرسل موقعًا لرحلة ليست له');
  exception when others then out := array_append(out,'PASS C2 السائق لا يرسل موقعًا لرحلة ليست له'); end;
  begin perform public.start_trip(rtrip[2]); out := array_append(out,'FAIL C3 بدأ رحلة ليست له');
  exception when others then out := array_append(out,'PASS C3 السائق لا يبدأ رحلة ليست له'); end;
  begin select id into ts1 from public.trip_stops where trip_id=trip[2] and stop_order=1;
    perform public.arrive_at_stop(trip[2], ts1, 24.1701, 47.3001, 8); out := array_append(out,'FAIL C4 اعتمد محطة في رحلة ليست له');
  exception when others then out := array_append(out,'PASS C4 السائق لا يعتمد محطة في رحلة ليست له'); end;
  begin perform public.complete_trip(trip[2], true); out := array_append(out,'FAIL C5 أنهى رحلة ليست له');
  exception when others then out := array_append(out,'PASS C5 السائق لا ينهي رحلة ليست له'); end;
  reset role;

  -- ───────── د) رفع الصلاحيات ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  begin insert into public.user_roles (user_id, role) values (stranger,'super_admin'); out := array_append(out,'FAIL D1 منح نفسه مدير نظام');
  exception when others then out := array_append(out,'PASS D1 المستخدم لا يمنح نفسه دور مدير النظام'); end;
  begin perform public.admin_set_platform_role(stranger,'executive',true,'الخرج'); out := array_append(out,'FAIL D2 منح نفسه إدارة تنفيذية');
  exception when others then out := array_append(out,'PASS D2 المستخدم لا يمنح نفسه الإدارة التنفيذية'); end;
  begin insert into public.school_members (school_id, user_id, role, status) values (sch[1], stranger, 'school_admin', 'active'); out := array_append(out,'FAIL D3 أضاف نفسه مديرًا لمدرسة');
  exception when others then out := array_append(out,'PASS D3 المستخدم لا يضيف نفسه مديرًا لمدرسة'); end;
  begin update public.profiles set status='active' where user_id=stranger;
    select status into x from public.profiles where user_id=stranger;
    out := array_append(out,(case when coalesce(x,'') <> 'active' then 'PASS' else 'FAIL' end)||' D4 المستخدم لا يفعّل حسابه بنفسه ('||coalesce(x,'—')||')');
  exception when others then out := array_append(out,'PASS D4 المستخدم لا يفعّل حسابه بنفسه'); end;
  begin perform public.activate_school(sch[1],'zz-iso-stranger@example.com'); out := array_append(out,'FAIL D5 فعّل مدرسة');
  exception when others then out := array_append(out,'PASS D5 المستخدم العادي لا يفعّل مدرسة'); end;
  select (select count(*) from public.students) + (select count(*) from public.trips) + (select count(*) from public.vehicle_locations)
       + (select count(*) from public.guardians) + (select count(*) from public.drivers) into n;
  out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' D6 مستخدم غير مرتبط لا يرى أي بيانات ('||n||')');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true); set local role anon;
  begin select (select count(*) from public.students) + (select count(*) from public.trips) + (select count(*) from public.vehicle_locations)
       + (select count(*) from public.profiles) + (select count(*) from public.guardians) into n;
    out := array_append(out,(case when n=0 then 'PASS' else 'FAIL' end)||' D7 الزائر بدون دخول لا يرى بيانات الطلاب والرحلات والحسابات ('||n||')');
  exception when insufficient_privilege then out := array_append(out,'PASS D7 الزائر بدون دخول لا يرى بيانات الطلاب والرحلات والحسابات'); end;
  reset role;

  -- ───────── هـ) الرحلة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dr[1],'role','authenticated')::text, true); set local role authenticated;
  perform public.submit_vehicle_check(trip[1], '{"الإطارات":true}'::jsonb); perform public.start_trip(trip[1]);
  select id into ts1 from public.trip_stops where trip_id=trip[1] and stop_order=1; select id into ts2 from public.trip_stops where trip_id=trip[1] and stop_order=2;
  insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (trip[1], 24.1701, 47.3001, 8);
  perform public.arrive_at_stop(trip[1], ts1, 24.1701, 47.3001, 8);
  perform public.record_attendance(trip[1], stu[1], 'boarded','manual',24.1701,47.3001,null,null);
  begin perform public.record_attendance(trip[1], stu[1], 'boarded','manual',24.1701,47.3001,null,null); exception when others then null; end;
  select count(*) into n from public.attendance_logs where trip_id=trip[1] and student_id=stu[1] and event_type='boarded';
  out := array_append(out,(case when n=1 then 'PASS' else 'FAIL' end)||' E1 لا يتكرر تسجيل صعود الطالب نفسه ('||n||')');
  begin perform public.complete_trip(trip[1], false); out := array_append(out,'FAIL E2 أنهى الرحلة بدون تأكيد خلو الباص');
  exception when others then out := array_append(out,'PASS E2 لا تنتهي الرحلة بدون تأكيد السائق خلو الباص'); end;
  insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (trip[1], 24.1601, 47.3101, 8);
  perform public.arrive_at_stop(trip[1], ts2, 24.1601, 47.3101, 8); perform public.complete_trip(trip[1], true);

  -- العودة: يصعد الطالب من المدرسة، والسائق يحاول إنهاء الرحلة دون تسجيل نزوله
  perform public.submit_vehicle_check(rtrip[1], '{"الإطارات":true}'::jsonb); perform public.start_trip(rtrip[1]);
  select id into ts1 from public.trip_stops where trip_id=rtrip[1] and stop_order=1; select id into ts2 from public.trip_stops where trip_id=rtrip[1] and stop_order=2;
  insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (rtrip[1], 24.1601, 47.3101, 8);
  perform public.arrive_at_stop(rtrip[1], ts1, 24.1601, 47.3101, 8);
  perform public.record_attendance(rtrip[1], stu[1], 'boarded_return','manual',24.1601,47.3101,null,null);
  insert into public.vehicle_locations (trip_id, latitude, longitude, accuracy) values (rtrip[1], 24.1701, 47.3001, 8);
  perform public.arrive_at_stop(rtrip[1], ts2, 24.1701, 47.3001, 8);
  v := public.complete_trip(rtrip[1], true);
  select status into x from public.trips where id=rtrip[1];
  out := array_append(out,(case when v->>'completed'='false' and x <> 'completed' then 'PASS' else 'FAIL' end)
    ||' E3 لا تنتهي رحلة العودة والطالب ما زال في الباص ('||coalesce(v->>'reason','')||')');
  reset role;
  select count(*) into n from public.notifications where user_id=pr[1] and type='child_on_bus';
  out := array_append(out,(case when n>0 then 'PASS' else 'FAIL' end)||' E4 المدرسة تُنبَّه فورًا بوجود طالب في الباص');
  perform set_config('request.jwt.claims', json_build_object('sub',dr[1],'role','authenticated')::text, true); set local role authenticated;
  perform public.record_attendance(rtrip[1], stu[1], 'dropped_home','manual',24.1701,47.3001,null,null);
  v := public.complete_trip(rtrip[1], true);
  out := array_append(out,(case when v->>'completed'='true' then 'PASS' else 'FAIL' end)||' E5 تنتهي الرحلة بعد تسجيل نزول الطالب');
  reset role;

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
