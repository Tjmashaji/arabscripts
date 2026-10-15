-- المسارات: الاقتراح والأوقات والدمج في عملية واحدة، وفترتان للباص بلا تداخل، والإسناد الجماعي. يُلغى كل شيء في النهاية.
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; drv uuid; x uuid; ra uuid; rb uuid; rc uuid; s1 uuid; s2 uuid; s3 uuid; st1 uuid; st2 uuid; st3 uuid; ok boolean; x_n int;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-rt-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-rt-ex@example.com',now(),'authenticated','authenticated'),
    (pr,'zz-rt-pr@example.com',now(),'authenticated','authenticated'), (dr,'zz-rt-dr@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-rt-stranger@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, pr, dr, stranger]) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز: مدرسة مفعّلة، باص، سائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_add_school('مدرسة مسارات', 'السيح', 'الخرج', null, 24.15, 47.31, null, true); sch := (v->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'مدير','مدير','0500000000','zz-rt-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  perform public.activate_school(sch,'zz-rt-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 992',30) returning id into bus;
  insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
    values (sch, pr, 'سائق','0511111129','zz-rt-dr@example.com','pending') returning id into x;
  perform public.review_driver_request(x, true, null, bus);
  select id into drv from public.drivers where school_id = sch limit 1;

  -- طلاب بمواقع منازل: اثنان قرب محطة الشمال وواحد قرب محطة الجنوب
  v := public.import_students(sch, jsonb_build_array(
    jsonb_build_object('name','طالب شمال ١','lat','24.200','lng','47.300'),
    jsonb_build_object('name','طالب شمال ٢','lat','24.201','lng','47.301'),
    jsonb_build_object('name','طالب جنوب','lat','24.100','lng','47.300')));
  select id into st1 from public.students where school_id = sch and full_name = 'طالب شمال ١';
  select id into st2 from public.students where school_id = sch and full_name = 'طالب شمال ٢';
  select id into st3 from public.students where school_id = sch and full_name = 'طالب جنوب';

  -- ───────── 1) اقتراح المسارات في عملية واحدة ─────────
  n := public.school_create_planned_routes(sch, jsonb_build_array(jsonb_build_object('name','مسار مقترح','direction','to_school','time','06:00','minutes',40,
    'stops', jsonb_build_array(
      jsonb_build_object('label','الشمال','type','pickup','lat',24.2,'lng',47.3,'students',jsonb_build_array(st1, st2)),
      jsonb_build_object('label','الجنوب','type','pickup','lat',24.1,'lng',47.3,'students',jsonb_build_array(st3)),
      jsonb_build_object('label','المدرسة','type','school','lat',24.15,'lng',47.31)))));
  select id into ra from public.routes where school_id = sch and name = 'مسار مقترح';
  select count(*) into x_n from public.student_route_assignments where route_id = ra and status = 'active';
  out := array_append(out, (case when n = 1 and x_n = 3 and (select count(*) from public.route_stops where route_id = ra) = 3 then 'PASS' else 'FAIL' end) || ' 1 إنشاء المسار المقترح بمحطاته وطلابه');
  -- خطة فيها طالب من مدرسة أخرى (غير موجود): لا يُنشأ شيء
  begin
    perform public.school_create_planned_routes(sch, jsonb_build_array(jsonb_build_object('name','مسار ناقص','direction','to_school','time','09:00',
      'stops', jsonb_build_array(jsonb_build_object('label','أ','lat',24.2,'lng',47.3,'students',jsonb_build_array(gen_random_uuid())),
                                 jsonb_build_object('label','المدرسة','type','school','lat',24.15,'lng',47.31)))));
    ok := false;
  exception when others then ok := true; end;
  out := array_append(out, (case when ok and not exists (select 1 from public.routes where school_id = sch and name = 'مسار ناقص') then 'PASS' else 'FAIL' end) || ' 2 فشل خطوة يلغي إنشاء المسار كله');

  -- ───────── 3) أوقات المحطات دفعة واحدة ─────────
  perform public.school_set_stop_times(ra, array['06:00','06:12','06:30']::time[], 30);
  out := array_append(out, (case when (select array_agg(scheduled_time order by stop_order)::text from public.route_stops where route_id = ra) = '{06:00:00,06:12:00,06:30:00}'
    and (select estimated_duration_minutes from public.routes where id = ra) = 30 then 'PASS' else 'FAIL' end) || ' 3 أوقات المحطات ومدة المسار');

  -- ───────── 4-6) فترتان للباص نفسه، ومنع التداخل ─────────
  update public.routes set bus_id = bus, driver_id = drv, days = '{0,1,2,3,4,5,6}' where id = ra;
  insert into public.routes (school_id, name, direction, scheduled_time, estimated_duration_minutes, bus_id, driver_id, days)
    values (sch, 'الفترة الثانية', 'to_school', '06:45', 30, bus, drv, '{0,1,2,3,4,5,6}') returning id into rb;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rb,1,'حي','pickup',24.2,47.3) returning id into s1;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rb,2,'المدرسة','school',24.15,47.31);
  begin
    insert into public.routes (school_id, name, direction, scheduled_time, estimated_duration_minutes, bus_id, days)
      values (sch, 'متداخل', 'to_school', '06:20', 30, bus, '{1}');
    ok := false;
  exception when others then ok := sqlerrm = 'BUS_SCHEDULE_OVERLAP'; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' 4 منع مسار يتداخل وقته مع مسار آخر لنفس الباص');
  begin
    update public.routes set scheduled_time = '06:10' where id = rb; ok := false;
  exception when others then ok := sqlerrm = 'BUS_SCHEDULE_OVERLAP'; end;
  update public.routes set name = 'الفترة الثانية' where id = rb; -- تعديل لا يمس الوقت لا يُفحص
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' 5 منع تعديل الوقت إلى وقت متداخل');

  -- ───────── 7) إسناد جماعي لأقرب محطة ─────────
  n := public.school_bulk_assign(rb, array[st1, st3]);
  out := array_append(out, (case when n = 2 and (select count(*) from public.student_route_assignments where route_id = rb and stop_id = s1 and status = 'active') = 2
    then 'PASS' else 'FAIL' end) || ' 6 إسناد جماعي: كل طالب لأقرب محطة');
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-2','أ ب ج 993',1) returning id into x;
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, days) values (sch, 'باص صغير', 'to_home', '13:00', x, '{0}') returning id into rc;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rc,1,'المدرسة','school',24.15,47.31);
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (rc,2,'حي','dropoff',24.2,47.3);
  begin
    perform public.school_bulk_assign(rc, array[st1, st2]); ok := false;
  exception when others then ok := sqlerrm = 'BUS_CAPACITY_EXCEEDED'; end;
  out := array_append(out, (case when ok and not exists (select 1 from public.student_route_assignments where route_id = rc) then 'PASS' else 'FAIL' end) || ' 7 تجاوز السعة يلغي الإسناد الجماعي كله');

  -- ───────── 8) دمج المحطات في عملية واحدة ─────────
  select id into s2 from public.route_stops where route_id = ra and label = 'الشمال';
  select id into s3 from public.route_stops where route_id = ra and label = 'الجنوب';
  n := public.school_merge_stops(ra, jsonb_build_array(jsonb_build_object('keep', s2, 'merge', jsonb_build_array(s3))));
  out := array_append(out, (case when n = 1 and (select count(*) from public.route_stops where route_id = ra) = 2
    and (select count(*) from public.student_route_assignments where route_id = ra and stop_id = s2) = 3
    and (select array_agg(stop_order order by stop_order)::text from public.route_stops where route_id = ra) = '{1,2}'
    and (select label from public.route_stops where id = s2) = 'نقطة تجمع: الشمال' then 'PASS' else 'FAIL' end) || ' 8 دمج المحطات: الطلاب ينتقلون والترقيم بلا فجوات');
  reset role;

  -- ───────── 9) رحلتان للسائق في اليوم ─────────
  begin
    insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status) values (sch, ra, bus, drv, 'to_school', 'scheduled');
    insert into public.trips (school_id, route_id, bus_id, driver_id, direction, status) values (sch, rb, bus, drv, 'to_school', 'scheduled');
    ok := true;
  exception when others then ok := false; out := array_append(out, 'INFO '||sqlerrm); end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' 9 رحلتان بنفس الاتجاه لنفس الباص والسائق في اليوم');

  -- ───────── 10) غير موظفي المدرسة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.school_bulk_assign(rb, array[st2]); ok := false; exception when others then ok := sqlstate = '42501'; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' 10 الإسناد الجماعي لموظفي المدرسة فقط');
  reset role;

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
