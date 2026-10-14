-- إصلاحات ولي الأمر: غياب اليوم كله، والشكاوى ورد المدرسة. يُلغى كل شيء في النهاية (انظر README.md).
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; drv uuid; stu uuid; route uuid; route2 uuid; rs1 uuid; x uuid; r1 uuid; r2 uuid; pa uuid := gen_random_uuid(); t1 uuid; t2 uuid; fb uuid; bus2 uuid; drv2 uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-par-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-par-ex@example.com',now(),'authenticated','authenticated'),
    (pr,'zz-par-pr@example.com',now(),'authenticated','authenticated'), (dr,'zz-par-dr@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-par-stranger@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, pr, dr, stranger]) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز: مدرسة مفعّلة، باص، سائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_add_school('مدرسة أولياء', 'السيح', 'الخرج', null, 24.15, 47.31, null, true); sch := (v->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'مدير','مدير','0500000000','zz-par-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  perform public.activate_school(sch,'zz-par-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 995',30) returning id into bus;
  insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
    values (sch, pr, 'سائق','0511111116','zz-par-dr@example.com','pending') returning id into x;
  perform public.review_driver_request(x, true, null, bus);
  select id into drv from public.drivers where school_id = sch limit 1;

  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-2','أ ب ج 996',30) returning id into bus2;
  v := public.import_students(sch, '[{"name":"طالب الغياب","grade":"الأول","parent_name":"الأب","parent_email":"zz-par-pa@example.com"}]'::jsonb);
  select id into stu from public.students where school_id = sch and full_name = 'طالب الغياب';
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id, days) values (sch,'ذهاب','to_school','06:30', bus, drv, '{0,1,2,3,4,5,6}') returning id into route;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,1,'منزل','pickup',24.16,47.30) returning id into rs1;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,2,'المدرسة','school',24.15,47.31);
  insert into public.student_route_assignments (student_id, route_id, stop_id) values (stu, route, rs1);
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id, days) values (sch,'عودة','to_home','13:00', bus, drv, '{0,1,2,3,4,5,6}') returning id into route2;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route2,1,'المدرسة','school',24.15,47.31);
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route2,2,'منزل','dropoff',24.16,47.30) returning id into x;
  insert into public.student_route_assignments (student_id, route_id, stop_id) values (stu, route2, x);
  v := public.create_today_trips(sch);
  reset role;
  insert into auth.users (id, email, email_confirmed_at, aud, role) values (pa,'zz-par-pa@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) values (pa,'ولي','active') on conflict (user_id) do update set status = 'active';
  update public.guardians set user_id = pa where school_id = sch and email = 'zz-par-pa@example.com';
  select id into t1 from public.trips where route_id = route; select id into t2 from public.trips where route_id = route2;
  out := array_append(out, (case when t1 is not null and t2 is not null then 'PASS' else 'FAIL' end) || ' 0 رحلتا الذهاب والعودة اليوم');

  -- ───────── غياب اليوم كله ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  begin n := public.guardian_absent_today(stu, true);
    out := array_append(out, (case when n = 2 and (select count(*) from public.trip_students where student_id = stu and status = 'absent') = 2 then 'PASS' else 'FAIL' end) || ' 1 غياب اليوم يشمل الذهاب والعودة');
  exception when others then out := array_append(out,'FAIL 1 '||sqlerrm); end;
  reset role;
  select count(*) into n from public.student_permissions where student_id = stu and status = 'active' and kind = 'absence';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 1b ويُحفظ تصريحًا لأي رحلة تُنشأ لاحقًا اليوم');
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  n := public.guardian_absent_today(stu, false);
  reset role;
  out := array_append(out, (case when (select count(*) from public.trip_students where student_id = stu and status = 'absent') = 0
    and (select count(*) from public.student_permissions where student_id = stu and status = 'active') = 0 then 'PASS' else 'FAIL' end) || ' 2 إلغاء الغياب يرجعه للرحلتين');
  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.guardian_absent_today(stu, true); out := array_append(out,'FAIL 3 غريب سجل غياب طالب');
  exception when others then out := array_append(out,'PASS 3 الغريب لا يسجل غياب طالب غيره'); end;
  reset role;

  -- ───────── الملاحظات ورد المدرسة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  begin insert into public.ratings_feedback (school_id, student_id, author_name, author_role, rating, category, message)
      values (sch, stu, 'ولي', 'parent', null, 'شكوى', 'تأخر الباص اليوم') returning id into fb;
    out := array_append(out,'PASS 4 شكوى بلا تقييم نجوم');
  exception when others then out := array_append(out,'FAIL 4 '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.reply_feedback(fb, 'رد', 'closed'); out := array_append(out,'FAIL 5a السائق رد على شكوى');
  exception when others then out := array_append(out,'PASS 5a الرد لفريق المدرسة فقط'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.reply_feedback(fb, 'نعتذر، تأخر بسبب الزحام وتابعنا مع السائق', 'closed'); out := array_append(out,'PASS 5 المدرسة ردت على الشكوى');
  exception when others then out := array_append(out,'FAIL 5 '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pa,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.ratings_feedback where id = fb and reply is not null and status = 'closed';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 6 ولي الأمر يرى رد المدرسة');
  select count(*) into n from public.notifications where type = 'feedback_reply';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 6b ويصله إشعار بالرد');
  reset role;

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
