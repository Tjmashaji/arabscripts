-- ملف الطالب والسائق: تعديل البيانات، أكثر من ولي أمر، الإيقاف والانسحاب. يُلغى كل شيء في النهاية (انظر README.md).
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; drv uuid; stu uuid; route uuid; route2 uuid; rs1 uuid; x uuid; r1 uuid; r2 uuid; g1 uuid; g2 uuid; dru uuid; trip uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-prof-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-prof-ex@example.com',now(),'authenticated','authenticated'),
    (pr,'zz-prof-pr@example.com',now(),'authenticated','authenticated'), (dr,'zz-prof-dr@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-prof-stranger@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, pr, dr, stranger]) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز: مدرسة مفعّلة، باص، سائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_add_school('مدرسة ملفات', 'السيح', 'الخرج', null, 24.15, 47.31, null, true); sch := (v->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'مدير','مدير','0500000000','zz-prof-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  perform public.activate_school(sch,'zz-prof-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 992',30) returning id into bus;
  insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
    values (sch, pr, 'سائق','0511111118','zz-prof-dr@example.com','pending') returning id into x;
  perform public.review_driver_request(x, true, null, bus);
  select id into drv from public.drivers where school_id = sch limit 1;

  -- طالب بولي أمر واحد ومسار
  v := public.import_students(sch, '[{"name":"طالب الملف","grade":"الأول","parent_name":"الأب","parent_email":"zz-prof-pa@example.com"}]'::jsonb);
  select id into stu from public.students where school_id = sch and full_name = 'طالب الملف';
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id, days)
    values (sch,'مسار الملف','to_school','06:30', bus, drv, '{0,1,2,3,4,5,6}') returning id into route;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,1,'منزل','pickup',24.16,47.30) returning id into rs1;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,2,'المدرسة','school',24.15,47.31);
  insert into public.student_route_assignments (student_id, route_id, stop_id) values (stu, route, rs1);

  -- ───────── تعديل البيانات وأولياء الأمور ─────────
  begin update public.students set class_name = '1/ب', emergency_contact_name = 'العم', emergency_contact_phone = '0555555555' where id = stu;
    select count(*) into n from public.students where id = stu and class_name = '1/ب';
    out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 1 المدرسة تعدّل الفصل وجهة الطوارئ');
  exception when others then out := array_append(out,'FAIL 1 '||sqlerrm); end;
  begin g2 := public.add_student_guardian(stu, 'الأم', '0566666666', 'zz-prof-ma@example.com', 'الأم');
    select count(*) into n from public.guardian_students where student_id = stu;
    out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' 2 إضافة ولي أمر ثان');
  exception when others then out := array_append(out,'FAIL 2 '||sqlerrm); end;
  begin perform public.add_student_guardian(stu, 'الأم', null, 'ZZ-prof-ma@example.com', null); out := array_append(out,'FAIL 2b ربط مكرر');
  exception when others then out := array_append(out, (case when sqlerrm = 'ALREADY_LINKED' then 'PASS' else 'FAIL' end) || ' 2b لا يتكرر ربط نفس ولي الأمر'); end;
  begin perform public.add_student_guardian(stu, 'بلا تواصل', null, null, null); out := array_append(out,'FAIL 2c ولي أمر بلا جوال ولا بريد');
  exception when others then out := array_append(out,'PASS 2c ولي الأمر يحتاج جوالًا أو بريدًا'); end;
  select guardian_id into g1 from public.guardian_students where student_id = stu and is_primary;
  begin perform public.remove_student_guardian(stu, g1);
    select count(*) into n from public.guardian_students where student_id = stu and guardian_id = g2 and is_primary;
    out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 3 حذف ولي الأمر الأساسي ينقل الأساسية للآخر');
  exception when others then out := array_append(out,'FAIL 3 '||sqlerrm); end;
  begin perform public.remove_student_guardian(stu, g2); out := array_append(out,'FAIL 3b حذف آخر ولي أمر');
  exception when others then out := array_append(out,(case when sqlerrm = 'LAST_GUARDIAN' then 'PASS' else 'FAIL' end) || ' 3b لا يُحذف آخر ولي أمر'); end;

  -- ───────── الإيقاف والانسحاب ─────────
  begin perform public.set_student_status(stu, 'suspended', null); out := array_append(out,'FAIL 4a إيقاف بلا سبب');
  exception when others then out := array_append(out,'PASS 4a الإيقاف يحتاج سببًا'); end;
  perform public.set_student_status(stu, 'suspended', 'لم تُسدد الرسوم');
  v := public.create_today_trips(sch);
  out := array_append(out, (case when (v->>'created')::int = 0 and v::text like '%NO_STUDENTS%' then 'PASS' else 'FAIL' end) || ' 4 الطالب الموقوف لا يُحسب في جاهزية المسار');
  perform public.set_student_status(stu, 'active', null);
  perform public.set_student_status(stu, 'inactive', 'انتقل لمدرسة أخرى');
  select count(*) into n from public.student_route_assignments where student_id = stu and status = 'active';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 5 الانسحاب يلغي إسناد المسار');
  perform public.set_student_status(stu, 'active', null);
  update public.student_route_assignments set status = 'active' where student_id = stu;

  -- ───────── السائق ─────────
  begin perform public.update_driver_profile(drv, 'سائق معدّل', '0577777777', 'zz-prof-dr@example.com', 'L-1');
    select count(*) into n from public.drivers where id = drv and full_name = 'سائق معدّل' and license_number = 'L-1';
    out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 6 تعديل بيانات السائق');
  exception when others then out := array_append(out,'FAIL 6 '||sqlerrm); end;
  update public.drivers set user_id = dr where id = drv;
  begin perform public.update_driver_profile(drv, 'سائق معدّل', null, 'other@example.com', null); out := array_append(out,'FAIL 6b غيّر بريد حساب مربوط');
  exception when others then out := array_append(out,(case when sqlerrm = 'EMAIL_LOCKED' then 'PASS' else 'FAIL' end) || ' 6b بريد السائق المربوط لا يتغير'); end;
  v := public.set_driver_status(drv, 'suspended', 'مخالفة');
  v := public.create_today_trips(sch);
  out := array_append(out, (case when v::text like '%DRIVER_SUSPENDED%' then 'PASS' else 'FAIL' end) || ' 7 السائق الموقوف لا تُنشأ له رحلات');
  reset role; select count(*) into n from public.notifications where user_id = dr and type = 'driver_status'; set local role authenticated;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 7b السائق يُبلَّغ بإيقافه');
  v := public.set_driver_status(drv, 'active', null);
  v := public.create_today_trips(sch);
  select id into trip from public.trips where route_id = route;
  out := array_append(out, (case when trip is not null then 'PASS' else 'FAIL' end) || ' 8 بعد إعادة التفعيل تُنشأ الرحلة');
  v := public.set_driver_status(drv, 'suspended', 'اختبار');
  out := array_append(out, (case when (v->>'scheduled_today')::int = 1 then 'PASS' else 'FAIL' end) || ' 8b الإيقاف يذكر رحلات اليوم المجدولة');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.set_student_status(stu, 'inactive', 'x'); out := array_append(out,'FAIL 9 الغريب غيّر حالة الطالب');
  exception when others then out := array_append(out,'PASS 9 الغريب لا يغيّر حالة الطالب'); end;
  begin perform public.add_student_guardian(stu, 'دخيل', '0500000001', null, null); out := array_append(out,'FAIL 9b الغريب أضاف ولي أمر');
  exception when others then out := array_append(out,'PASS 9b الغريب لا يضيف ولي أمر'); end;
  begin perform public.set_driver_status(drv, 'active', null); out := array_append(out,'FAIL 9c الغريب فعّل السائق');
  exception when others then out := array_append(out,'PASS 9c الغريب لا يغيّر حالة السائق'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.set_driver_status(drv, 'active', null); out := array_append(out,'FAIL 9d السائق فعّل نفسه');
  exception when others then out := array_append(out,'PASS 9d السائق لا يعيد تفعيل نفسه'); end;
  reset role;

  -- ───────── مدير النظام: الدخول كـ ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  begin v := public.admin_view_as('school', sch); out := array_append(out, (case when v->>'school_name' = 'مدرسة ملفات' then 'PASS' else 'FAIL' end) || ' 10 مدير النظام يدخل كمدرسة');
  exception when others then out := array_append(out,'FAIL 10 '||sqlerrm); end;
  begin v := public.admin_view_as('driver', drv); out := array_append(out, (case when (v->>'driver_id')::uuid = drv then 'PASS' else 'FAIL' end) || ' 10b ويدخل كسائق');
  exception when others then out := array_append(out,'FAIL 10b '||sqlerrm); end;
  reset role;
  select count(*) into n from public.audit_logs where actor_id = dev and action = 'admin_view_as';
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' 10c كل دخول مسجل في سجل التدقيق');
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_view_as('school', sch); out := array_append(out,'FAIL 10d مدير المدرسة استخدم الدخول كـ');
  exception when others then out := array_append(out,'PASS 10d الدخول كـ لمدير النظام فقط'); end;
  reset role;

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
