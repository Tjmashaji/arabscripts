-- عمليات المدرسة: استيراد الطلاب، اعتماد الطلبات دفعة واحدة، وإنشاء رحلات اليوم يدويًا وتلقائيًا. يُلغى كل شيء في النهاية (انظر README.md).
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; drv uuid; stu uuid; route uuid; route2 uuid; rs1 uuid; x uuid; r1 uuid; r2 uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-ops-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-ops-ex@example.com',now(),'authenticated','authenticated'),
    (pr,'zz-ops-pr@example.com',now(),'authenticated','authenticated'), (dr,'zz-ops-dr@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-ops-stranger@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, pr, dr, stranger]) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز: مدرسة مفعّلة، باص، سائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_add_school('مدرسة عمليات', 'السيح', 'الخرج', null, 24.15, 47.31, null, true); sch := (v->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'مدير','مدير','0500000000','zz-ops-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  perform public.activate_school(sch,'zz-ops-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 991',30) returning id into bus;
  insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
    values (sch, pr, 'سائق','0511111119','zz-ops-dr@example.com','pending') returning id into x;
  perform public.review_driver_request(x, true, null, bus);
  select id into drv from public.drivers where school_id = sch limit 1;

  -- ───────── استيراد الطلاب ─────────
  begin
    v := public.import_students(sch, jsonb_build_array(
      jsonb_build_object('name','طالب مستورد','grade','الثالث','class_name','3/أ','parent_name','ولي','parent_phone','0533333333',
        'parent_email','zz-ops-pa@example.com','emergency_name','عم','emergency_phone','0544444444','lat','24.16','lng','47.30'),
      jsonb_build_object('name','  ','grade','الثالث'),
      jsonb_build_object('name','طالب مستورد','grade','الثالث','parent_phone','0533333333'),
      jsonb_build_object('name','طالب بريد خطأ','parent_email','not-an-email'),
      jsonb_build_object('name','طالب موقع ناقص','lat','24.1')));
    select id into stu from public.students where school_id = sch and full_name = 'طالب مستورد';
    out := array_append(out, (case when (v->>'created')::int = 1 and jsonb_array_length(v->'errors') = 4
      and (v->'errors'->0->>'error') = 'NAME_REQUIRED' and (v->'errors'->1->>'error') = 'DUPLICATE_STUDENT'
      and (v->'errors'->2->>'error') = 'INVALID_EMAIL' and (v->'errors'->3->>'error') = 'INVALID_LOCATION'
      then 'PASS' else 'FAIL' end) || ' 1 استيراد: صف ناجح وأربعة أخطاء بأسبابها');
  exception when others then out := array_append(out,'FAIL 1 '||sqlerrm); end;
  select count(*) into n from public.students s where s.id = stu and s.class_name = '3/أ' and s.emergency_contact_phone = '0544444444'
    and exists (select 1 from public.guardian_students g join public.guardians gd on gd.id = g.guardian_id where g.student_id = s.id and gd.email = 'zz-ops-pa@example.com');
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 2 الطالب المستورد: الفصل وجهة الطوارئ وولي الأمر بالبريد');

  -- ───────── اعتماد جماعي ─────────
  insert into public.student_onboarding_requests (school_id, created_by, student_name, grade, parent_email, status)
    values (sch, pr, 'طلب أول', 'الأول', 'zz-ops-p1@example.com', 'pending') returning id into r1;
  insert into public.student_onboarding_requests (school_id, created_by, student_name, grade, parent_email, status)
    values (sch, pr, 'طلب ثان', 'الأول', 'zz-ops-p2@example.com', 'pending') returning id into r2;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  v := public.approve_student_requests(array[r1]);
  out := array_append(out, (case when (v->>'approved')::int = 0 and (v->'errors'->0->>'error') = 'FORBIDDEN' then 'PASS' else 'FAIL' end) || ' 3 الغريب لا يعتمد طلبات المدرسة');
  begin perform public.import_students(sch, '[{"name":"دخيل الغريب"}]'::jsonb); out := array_append(out,'FAIL 3b الغريب استورد طلابًا');
  exception when others then out := array_append(out,'PASS 3b الغريب لا يستورد طلابًا'); end;
  begin perform public.create_today_trips(sch); out := array_append(out,'FAIL 3c الغريب أنشأ رحلات');
  exception when others then out := array_append(out,'PASS 3c الغريب لا ينشئ رحلات'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.create_today_trips(sch); out := array_append(out,'FAIL 3d السائق أنشأ رحلات المدرسة');
  exception when others then out := array_append(out,'PASS 3d السائق لا ينشئ رحلات المدرسة'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  v := public.approve_student_requests(array[r1, r2, r1]);
  out := array_append(out, (case when (v->>'approved')::int = 2 and (v->'errors'->0->>'error') = 'ALREADY_REVIEWED' then 'PASS' else 'FAIL' end) || ' 4 اعتماد طلبين دفعة واحدة، والمكرر مرفوض');

  -- ───────── رحلات اليوم ─────────
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, driver_id, days)
    values (sch,'مسار جاهز','to_school','06:30', bus, drv, '{0,1,2,3,4,5,6}') returning id into route;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,1,'منزل','pickup',24.16,47.30) returning id into rs1;
  insert into public.route_stops (route_id, stop_order, label, stop_type, latitude, longitude) values (route,2,'المدرسة','school',24.15,47.31);
  insert into public.student_route_assignments (student_id, route_id, stop_id) values (stu, route, rs1);
  insert into public.routes (school_id, name, direction, scheduled_time, bus_id, days)
    values (sch,'مسار بلا سائق','to_home','13:00', bus, '{0,1,2,3,4,5,6}') returning id into route2;

  begin
    v := public.create_today_trips(sch);
    out := array_append(out, (case when (v->>'created')::int = 1 and (v->'skipped'->0->>'reason') = 'NO_DRIVER' then 'PASS' else 'FAIL' end)
      || ' 5 رحلة للمسار الجاهز، والمسار بلا سائق مذكور بسببه');
  exception when others then out := array_append(out,'FAIL 5 '||sqlerrm); end;
  v := public.create_today_trips(sch);
  out := array_append(out, (case when (v->>'created')::int = 0 then 'PASS' else 'FAIL' end) || ' 6 التشغيل مرة ثانية لا يكرر الرحلة');
  update public.trips set status = 'cancelled' where route_id = route and trip_date = private.riyadh_today();
  v := public.create_today_trips(sch);
  out := array_append(out, (case when (v->>'created')::int = 0 then 'PASS' else 'FAIL' end) || ' 7 الرحلة الملغاة لا تُعاد تلقائيًا');
  delete from public.trips where route_id = route;

  insert into public.school_holidays (school_id, title, starts_on, ends_on) values (sch, 'إجازة اختبار', private.riyadh_today(), private.riyadh_today());
  v := public.create_today_trips(sch);
  out := array_append(out, (case when (v->>'created')::int = 0 and v::text like '%SCHOOL_HOLIDAY%' then 'PASS' else 'FAIL' end) || ' 8 لا رحلات في الإجازة');
  update public.school_holidays set cancelled_at = now() where school_id = sch;

  begin perform public.set_auto_daily_trips(sch, false); out := array_append(out,'PASS 9a إيقاف الإنشاء التلقائي');
  exception when others then out := array_append(out,'FAIL 9a '||sqlerrm); end;
  reset role;
  perform private.daily_trips();
  select count(*) into n from public.trips where route_id = route;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 9b المدرسة الموقفة لا تُنشأ لها رحلات');
  update public.schools set auto_daily_trips = true where id = sch;
  perform private.daily_trips();
  select count(*) into n from public.trips where route_id = route and status = 'scheduled';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 10 الإنشاء الصباحي التلقائي');
  select count(*) into n from public.notifications where user_id = pr and type = 'daily_trips_issues';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 11 ملخص للمدرسة بما تعذّر إنشاؤه');
  select count(*) into n from cron.job where jobname = 'masari-daily-trips';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 12 جدولة الإنشاء الصباحي');

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
