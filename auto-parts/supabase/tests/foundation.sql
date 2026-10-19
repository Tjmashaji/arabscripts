-- المرحلة A: الأدوار والصلاحيات والفصل بين المنشآت وسجل التدقيق. يُلغى كل شيء في النهاية بخطأ RESULT مقصود.
-- مستخدمون: مدير أعلى، مدير عمليات، موظف دعم، عميل، مالكا منشأتين (أ، ب)، وزائر بلا دخول.
do $$
declare
  sa uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); sup uuid := gen_random_uuid(); cus uuid := gen_random_uuid();
  oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid();
  org_a uuid; org_b uuid; out text[] := '{}'; n int; ok boolean; x text; p public.ap_profiles;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (sa, 'zz-ap-sa@example.com', now()), (ops, 'zz-ap-ops@example.com', now()), (sup, 'zz-ap-sup@example.com', now()),
    (cus, 'zz-ap-cus@example.com', now()), (oa, 'zz-ap-oa@example.com', now()), (ob, 'zz-ap-ob@example.com', now());

  -- كل مستخدم ينشئ ملفه عند أول دخول
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true); perform public.ap_ensure_profile('مدير', 'ar');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true); perform public.ap_ensure_profile('عمليات', 'ar');
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true); perform public.ap_ensure_profile('دعم', 'ar');
  perform set_config('request.jwt.claims', json_build_object('sub', cus, 'role', 'authenticated')::text, true); p := public.ap_ensure_profile('عميل', 'en');
  perform set_config('request.jwt.claims', json_build_object('sub', oa, 'role', 'authenticated')::text, true); perform public.ap_ensure_profile('مالك أ', 'zh');
  perform set_config('request.jwt.claims', json_build_object('sub', ob, 'role', 'authenticated')::text, true); perform public.ap_ensure_profile('مالك ب', 'xx');
  reset role;

  select count(*) into n from public.ap_profiles where user_id in (sa, ops, sup, cus, oa, ob);
  out := array_append(out, (case when n = 6 then 'PASS' else 'FAIL' end) || ' A1 يُنشأ ملف لكل مستخدم عند أول دخول');
  select count(*) into n from public.ap_user_preferences where (user_id = cus and locale = 'en') or (user_id = oa and locale = 'zh') or (user_id = ob and locale = 'ar');
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' A2 تُحفظ اللغة المفضلة، واللغة غير المفعّلة تتحول للعربية');

  -- لا أحد يمنح نفسه دورًا إداريًا
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cus, 'role', 'authenticated')::text, true);
  ok := false; begin insert into public.ap_staff_roles (user_id, role) values (cus, 'super_admin'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B1 العميل لا يستطيع إدراج دور إداري لنفسه مباشرة');
  ok := false; begin perform public.ap_admin_set_staff_role(cus, 'super_admin', true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B2 العميل لا يستطيع منح نفسه دورًا عبر الدالة');
  ok := false; begin update public.ap_profiles set status = 'active' where user_id = cus; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B3 العميل لا يعدّل حالة حسابه');
  update public.ap_profiles set full_name = 'عميل معدّل' where user_id = cus;
  update public.ap_profiles set full_name = 'اختراق' where user_id = sa;
  ok := false; begin insert into public.ap_audit_logs (action, entity_type) values ('fake', 'x'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B4 لا يستطيع أحد كتابة سجل تدقيق مزيف');
  select count(*) into n from public.ap_profiles;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B5 العميل لا يرى إلا ملفه (' || n || ')');
  select count(*) into n from public.ap_user_preferences;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B6 العميل لا يرى تفضيلات غيره');
  ok := false; begin perform public.ap_admin_update_setting('availability_max_age_hours', '1'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B7 العميل لا يعدّل إعدادات المنصة');
  reset role;
  select count(*) into n from public.ap_profiles where (user_id = cus and full_name = 'عميل معدّل') or (user_id = sa and full_name = 'مدير');
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' B8 المستخدم يعدّل اسمه فقط ولا يعدّل اسم غيره');

  -- تمهيد المدير الأعلى الأول (يُنفّذ مرة واحدة من SQL Editor)
  insert into public.ap_staff_roles (user_id, role) values (sa, 'super_admin');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.ap_admin_set_staff_role(ops, 'operations_admin', true);
  perform public.ap_admin_set_staff_role(sup, 'support_agent', true);
  select count(*) into n from public.ap_admin_list_staff();
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' C1 المدير الأعلى يمنح الأدوار ويعرضها');
  ok := false; begin perform public.ap_admin_set_staff_role(sa, 'super_admin', false); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C2 لا يمكن سحب آخر مدير أعلى');
  select count(*) into n from public.ap_admin_find_user('ZZ-AP-CUS@example.com');
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C3 البحث عن مستخدم بالبريد للمدير');

  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_set_staff_role(sup, 'super_admin', true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C4 موظف الدعم لا يدير الأدوار ولا يرفع صلاحيته');
  ok := false; begin perform public.ap_admin_find_user('zz-ap-cus@example.com'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C5 موظف الدعم لا يبحث في بريد المستخدمين');
  select count(*) into n from public.ap_audit_logs;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C6 موظف الدعم لا يقرأ سجل التدقيق');

  -- منشأتان: كل واحدة لا ترى الأخرى
  perform set_config('request.jwt.claims', json_build_object('sub', oa, 'role', 'authenticated')::text, true);
  org_a := public.ap_create_organization('منشأة أ التجارية', 'cn', array['supplier', 'carrier']::public.ap_capability[], 'A Trading', 'zh');
  perform set_config('request.jwt.claims', json_build_object('sub', ob, 'role', 'authenticated')::text, true);
  org_b := public.ap_create_organization('منشأة ب', 'SA', array['seller']::public.ap_capability[]);
  select count(*) into n from public.ap_organizations;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D1 مالك ب لا يرى إلا منشأته');
  select count(*) into n from public.ap_organization_verifications where organization_id = org_a;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D2 مالك ب لا يرى صفات منشأة أ');
  update public.ap_organizations set trade_name = 'سرقة' where id = org_a;
  ok := false; begin update public.ap_organizations set status = 'active' where id = org_b; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D3 المالك لا يفعّل منشأته بنفسه');
  ok := false; begin update public.ap_organization_verifications set status = 'approved' where organization_id = org_b; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D4 المالك لا يعتمد صفته بنفسه');
  ok := false; begin insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, ob, 'owner'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D5 لا يضيف أحد نفسه عضوًا في منشأة أخرى');
  ok := false; begin perform public.ap_admin_decide_capability(org_b, 'seller', 'approved'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D6 المالك لا يستدعي دالة الاعتماد');
  update public.ap_organizations set trade_name = 'B Store' where id = org_b;
  reset role;
  select count(*) into n from public.ap_organizations where (id = org_a and trade_name = 'A Trading') or (id = org_b and trade_name = 'B Store');
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' D7 المالك يعدّل بيانات منشأته فقط، ولا يلمس منشأة غيره');
  select status::text into x from public.ap_organizations where id = org_a;
  out := array_append(out, (case when x = 'pending' and not ap_private.org_can(org_a, 'supplier') then 'PASS' else 'FAIL' end)
    || ' D8 المنشأة الجديدة معلّقة ولا تمارس أي صفة قبل الاعتماد');

  -- الاعتماد: صفة تُقبل وأخرى تُرفض في المنشأة نفسها
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_decide_capability(org_a, 'carrier', 'rejected', '  '); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E1 الرفض بلا سبب مرفوض');
  perform public.ap_admin_decide_capability(org_a, 'supplier', 'approved');
  perform public.ap_admin_decide_capability(org_a, 'carrier', 'rejected', 'ترخيص النقل غير مرفق');
  select count(*) into n from public.ap_organizations;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' E2 مدير العمليات يرى كل المنشآت');
  ok := false; begin perform public.ap_admin_set_staff_role(cus, 'finance_admin', true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E3 مدير العمليات لا يدير الأدوار');
  reset role;
  out := array_append(out, (case when ap_private.org_can(org_a, 'supplier') and not ap_private.org_can(org_a, 'carrier') then 'PASS' else 'FAIL' end)
    || ' E4 اعتماد صفة المورد ورفض صفة الناقل لنفس المنشأة');
  select status::text into x from public.ap_organizations where id = org_a;
  out := array_append(out, (case when x = 'active' then 'PASS' else 'FAIL' end) || ' E5 تتفعل المنشأة بعد اعتماد أول صفة');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', oa, 'role', 'authenticated')::text, true);
  select decision_reason into x from public.ap_organization_verifications where organization_id = org_a and capability = 'carrier';
  out := array_append(out, (case when x = 'ترخيص النقل غير مرفق' then 'PASS' else 'FAIL' end) || ' E6 المتقدم يرى سبب الرفض الموجّه له');
  reset role;

  -- سجل التدقيق
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_organization_verifications' and actor_id = ops and action = 'update';
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' F1 قرارات الاعتماد مسجلة باسم من اتخذها');
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_staff_roles' and actor_id = sa;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' F2 منح الأدوار مسجل');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_audit_logs;
  out := array_append(out, (case when n > 0 then 'PASS' else 'FAIL' end) || ' F3 مدير العمليات يقرأ سجل التدقيق');
  ok := false; begin delete from public.ap_audit_logs; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F4 لا يحذف أحد سجل التدقيق');

  -- الإيقاف يسحب الصلاحيات فورًا
  reset role;
  update public.ap_profiles set status = 'suspended' where user_id = ops;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_decide_capability(org_b, 'seller', 'approved'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' G1 المدير الموقوف يفقد صلاحياته فورًا');

  -- الزائر بلا دخول
  reset role; set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_locales;
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' H1 الزائر يرى اللغات المفعّلة');
  select count(*) into n from public.ap_platform_settings;
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' H2 الزائر يرى الإعدادات العامة فقط');
  ok := false; begin select count(*) into n from public.ap_profiles; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H3 الزائر لا يقرأ الملفات الشخصية');
  ok := false; begin perform public.ap_ensure_profile('x', 'ar'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H4 الزائر لا يستدعي دوال الحساب');
  reset role;

  -- جلسة مجهولة (anonymous sign-in) لا تحصل على ملف
  insert into auth.users (id, email, is_anonymous) values (gen_random_uuid(), null, true) returning id into p.user_id;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p.user_id, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  ok := false; begin perform public.ap_ensure_profile('مجهول', 'ar'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H5 الجلسة المجهولة لا تنشئ ملفًا ولا منشأة');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
