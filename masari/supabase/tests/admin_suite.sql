-- أدوات مدير النظام: الثغرة، التذاكر، الإعلانات، الحدود، صحة النظام، الدمج والنقل، التصدير، البلاغات. يُلغى كل شيء في النهاية (انظر README.md).
do $$
declare
  dev uuid := gen_random_uuid(); ex uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  out text[] := '{}'; v jsonb; n int; sch uuid; bus uuid; drv uuid; stu uuid; route uuid; route2 uuid; rs1 uuid; x uuid; r1 uuid; r2 uuid; sch2 uuid; tk uuid; plan uuid; em uuid; al uuid; trip uuid; ex2 uuid := gen_random_uuid(); ct uuid := gen_random_uuid(); dup uuid := gen_random_uuid(); txt text;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (dev,'zz-adm-dev@example.com',now(),'authenticated','authenticated'), (ex,'zz-adm-ex@example.com',now(),'authenticated','authenticated'),
    (pr,'zz-adm-pr@example.com',now(),'authenticated','authenticated'), (dr,'zz-adm-dr@example.com',now(),'authenticated','authenticated'),
    (stranger,'zz-adm-stranger@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) select u, 'مستخدم', 'pending' from unnest(array[dev, ex, pr, dr, stranger]) u
    on conflict (user_id) do update set status = excluded.status;
  update public.profiles set status = 'active' where user_id = dev;
  insert into public.user_roles (user_id, role) values (dev,'super_admin');

  -- ───────── التجهيز: مدرسة مفعّلة، باص، سائق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_platform_role(ex,'executive',true,'الخرج');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_add_school('مدرسة إدارة', 'السيح', 'الخرج', null, 24.15, 47.31, null, true); sch := (v->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.school_claim_requests (school_id, contact_name, position, phone, email) values (sch,'مدير','مدير','0500000000','zz-adm-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  perform public.activate_school(sch,'zz-adm-pr@example.com');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-1','أ ب ج 993',30) returning id into bus;
  insert into public.driver_onboarding_requests (school_id, created_by, driver_name, phone, email, status)
    values (sch, pr, 'سائق','0511111117','zz-adm-dr@example.com','pending') returning id into x;
  perform public.review_driver_request(x, true, null, bus);
  select id into drv from public.drivers where school_id = sch limit 1;

  reset role;
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (ex2,'zz-adm-ex2@example.com',now(),'authenticated','authenticated'), (ct,'zz-adm-ct@example.com',now(),'authenticated','authenticated'),
    (dup,'zz-adm-dup@example.com',now(),'authenticated','authenticated');
  insert into public.profiles (user_id, full_name, status) values (ex2,'تنفيذي آخر','active'),(ct,'برج','active'),(dup,'مكرر','active')
    on conflict (user_id) do update set status = excluded.status;
  insert into public.user_roles (user_id, role, region) values (ex2, 'executive', 'الرياض');
  insert into auth.sessions (user_id) values (dup);
  insert into auth.refresh_tokens (user_id) values (dup::text);
  -- مدرسة ثانية للنقل
  insert into public.schools (name, city, region, status) values ('مدرسة النقل', 'الخرج', 'الخرج', 'active') returning id into sch2;

  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  -- ───────── 1) سد الثغرة ─────────
  insert into public.guardians (school_id, full_name, email, status) values (sch, 'ولي تجربة', 'zz-adm-g@example.com', 'active') returning id into x;
  begin update public.guardians set user_id = stranger where id = x; out := array_append(out,'FAIL 1 المدرسة ربطت ولي أمر بحساب غريب');
  exception when others then out := array_append(out,'PASS 1 المدرسة لا تربط سجلًا بحساب مباشرة'); end;
  begin insert into public.drivers (school_id, user_id, full_name, status) values (sch, stranger, 'سائق دخيل', 'pending'); out := array_append(out,'FAIL 1b أدخلت سائقًا بحساب غريب');
  exception when others then out := array_append(out,'PASS 1b لا إدخال سائق مربوط بحساب غيره'); end;
  begin update public.guardians set phone = '0500000009' where id = x; out := array_append(out,'PASS 1c تعديل باقي البيانات مسموح');
  exception when others then out := array_append(out,'FAIL 1c '||sqlerrm); end;

  -- ───────── 2) التذاكر ─────────
  begin tk := public.open_ticket('مشكلة في الحضور', 'bug', 'لا يظهر الطالب في الرحلة', sch); out := array_append(out,'PASS 2 المدرسة فتحت تذكرة');
  exception when others then out := array_append(out,'FAIL 2 '||sqlerrm); end;
  reset role;
  select count(*) into n from public.notifications where user_id = dev and type = 'support_ticket';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 2b مدير النظام يُبلَّغ بالتذكرة');
  perform set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.support_tickets where id = tk;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 2c الغريب لا يرى التذكرة');
  begin perform public.reply_ticket(tk, 'دخيل'); out := array_append(out,'FAIL 2d الغريب رد على تذكرة');
  exception when others then out := array_append(out,'PASS 2d الغريب لا يرد على تذكرة غيره'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.reply_ticket(tk, 'تم الإصلاح، جرّب الآن');
  reset role;
  select count(*) into n from public.notifications where user_id = pr and type = 'support_reply';
  select status into txt from public.support_tickets where id = tk;
  out := array_append(out, (case when n = 1 and txt = 'answered' then 'PASS' else 'FAIL' end) || ' 2e رد الدعم يصل لصاحب التذكرة');

  -- ───────── 3) الإعلانات ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_post_announcement('صيانة', 'صيانة الليلة', 'all', null, 'info', null, true); out := array_append(out,'FAIL 3a غير المدير نشر إعلانًا');
  exception when others then out := array_append(out,'PASS 3a الإعلان لمدير النظام فقط'); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_post_announcement('صيانة مجدولة', 'سيتوقف النظام عشر دقائق الليلة', 'school', 'الخرج', 'warning', now() + interval '1 day', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.my_announcements();
  out := array_append(out, (case when n = 1 and (v->>'notified')::int >= 1 then 'PASS' else 'FAIL' end) || ' 3 إعلان لمدارس الخرج يصل لمديرها');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',dr,'role','authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.my_announcements();
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 3b ولا يظهر للسائق');
  reset role;

  -- ───────── 4) حدود الباقة وتاريخ الاشتراك ─────────
  insert into public.masari_plans (name, monthly_price, max_buses, max_students) values ('صغيرة', 100, 1, 50) returning id into plan;
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  perform public.admin_set_school_subscription(sch, plan, 'active', 'monthly', date '2026-01-01', null);
  perform public.admin_set_school_subscription(sch, plan, 'active', 'yearly', null, date '2027-01-01');
  reset role;
  select count(*) into n from public.school_subscriptions where school_id = sch and starts_on = date '2026-01-01' and billing_period = 'yearly';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 4 تعديل الاشتراك يحفظ تاريخ بدايته');
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin insert into public.buses (school_id, bus_number, plate_number, capacity) values (sch,'B-2','أ ب ج 994',30); out := array_append(out,'FAIL 4b تجاوز حد الباصات');
  exception when others then out := array_append(out,(case when sqlerrm = 'PLAN_LIMIT_BUSES' then 'PASS' else 'FAIL' end) || ' 4b حد الباصات يفرضه الخادم'); end;
  reset role;

  -- ───────── 5) صحة النظام والإيرادات وسجل التدقيق ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  begin v := public.admin_health(); out := array_append(out, (case when (v->>'open_tickets')::int = 1 then 'PASS' else 'FAIL' end) || ' 5 تقرير صحة النظام');
  exception when others then out := array_append(out,'FAIL 5 '||sqlerrm); end;
  begin v := public.admin_revenue(); out := array_append(out, (case when (v->>'mrr')::numeric = 100 then 'PASS' else 'FAIL' end) || ' 5b الإيراد الشهري');
  exception when others then out := array_append(out,'FAIL 5b '||sqlerrm); end;
  select count(*) into n from public.admin_audit_search('zz-adm-dev', null, 'subscription_set', null, null, 50);
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' 5c البحث في سجل التدقيق بالمستخدم والإجراء');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_health(); out := array_append(out,'FAIL 5d غير المدير رأى صحة النظام');
  exception when others then out := array_append(out,'PASS 5d صحة النظام لمدير النظام فقط'); end;
  reset role;

  -- ───────── 6) أدوات المستخدمين والنقل ─────────
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  n := public.admin_revoke_sessions(dup);
  reset role;
  select count(*) into n from auth.refresh_tokens where user_id = dup::text and revoked;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 6 تسجيل خروج الحساب من كل الأجهزة');
  insert into public.school_members (school_id, user_id, role, status) values (sch, dup, 'operations', 'active');
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  v := public.admin_merge_accounts(dup, stranger);
  reset role;
  select count(*) into n from public.school_members where user_id = stranger and school_id = sch and status = 'active';
  out := array_append(out, (case when n = 1 and (select status from public.profiles where user_id = dup) = 'suspended' then 'PASS' else 'FAIL' end) || ' 6b دمج حساب مكرر ونقل ارتباطاته');
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_transfer_driver(drv, sch2);
    out := array_append(out, (case when (select school_id from public.drivers where id = drv) = sch2 and (select driver_id from public.buses where id = bus) is null then 'PASS' else 'FAIL' end) || ' 6c نقل سائق لمدرسة أخرى');
  exception when others then out := array_append(out,'FAIL 6c '||sqlerrm); end;
  reset role;
  insert into public.students (school_id, full_name, service_status) values (sch, 'طالب منقول', 'pending') returning id into stu;
  insert into public.guardian_students (guardian_id, student_id, is_primary) values (x, stu, true);
  perform set_config('request.jwt.claims', json_build_object('sub',dev,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_transfer_student(stu, sch2);
    select count(*) into n from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id where gs.student_id = stu and g.school_id = sch2;
    out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 6d نقل طالب مع ولي أمره');
  exception when others then out := array_append(out,'FAIL 6d '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pr,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.admin_transfer_student(stu, sch); out := array_append(out,'FAIL 6e مدير المدرسة نقل طالبًا');
  exception when others then out := array_append(out,'PASS 6e النقل لمدير النظام فقط'); end;
  -- ───────── 7) تصدير البيانات ─────────
  begin v := public.export_my_data(); out := array_append(out, (case when v->'account'->>'email' = 'zz-adm-pr@example.com' and jsonb_array_length(v->'support_tickets') = 1 then 'PASS' else 'FAIL' end) || ' 7 تصدير بيانات المستخدم');
  exception when others then out := array_append(out,'FAIL 7 '||sqlerrm); end;
  reset role;

  -- ───────── 8) البلاغات: الإدارة التنفيذية وبرج المراقبة ─────────
  update public.schools set region = 'الخرج' where id = sch;
  insert into public.routes (school_id, name, direction, scheduled_time, days) values (sch,'مسار البلاغ','to_school','06:30','{0,1,2,3,4,5,6}') returning id into route;
  insert into public.trips (school_id, route_id, direction, status, trip_date) values (sch, route, 'to_school', 'scheduled', private.riyadh_today()) returning id into trip;
  insert into public.emergency_reports (school_id, trip_id, reported_by, type, description) values (sch, trip, pr, 'breakdown', 'عطل') returning id into em;
  select count(*) into n from public.notifications where user_id = ex and type = 'emergency' and data->>'report_id' = em::text;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 8 الإدارة التنفيذية للمنطقة تُبلَّغ بالبلاغ');
  select count(*) into n from public.notifications where user_id = ex2 and type = 'emergency';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 8b ولا تُبلَّغ إدارة منطقة أخرى');
  perform set_config('request.jwt.claims', json_build_object('sub',ex,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.update_emergency(em, 'acknowledged', null); out := array_append(out,'PASS 8c الإدارة التنفيذية تستلم البلاغ');
  exception when others then out := array_append(out,'FAIL 8c '||sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ex2,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.update_emergency(em, 'resolved', 'x'); out := array_append(out,'FAIL 8d منطقة أخرى أغلقت البلاغ');
  exception when others then out := array_append(out,'PASS 8d منطقة أخرى لا تغلق البلاغ'); end;
  reset role;
  insert into public.school_members (school_id, user_id, role, status) values (sch, ct, 'control_tower', 'active');
  insert into public.trip_alerts (trip_id, school_id, type) values (trip, sch, 'long_stop') returning id into al;
  perform set_config('request.jwt.claims', json_build_object('sub',ct,'role','authenticated')::text, true); set local role authenticated;
  begin perform public.resolve_trip_alert(al, 'تواصلنا مع السائق'); out := array_append(out,'PASS 8e برج المراقبة يغلق تنبيه المسار');
  exception when others then out := array_append(out,'FAIL 8e '||sqlerrm); end;
  reset role;

  raise exception 'RESULT%', E'\n'||array_to_string(out, E'\n');
end $$;
