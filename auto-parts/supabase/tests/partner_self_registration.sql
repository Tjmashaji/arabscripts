-- تسجيل الشركاء بأنفسهم: من يقدر، ماذا يُنشأ، ولا صلاحية قبل الاعتماد، وإشعار فريق الاعتماد عند الإرسال.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  ops uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  app uuid; org uuid; n int; ok boolean; x text; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (u1, 'zz-j-u1@example.com', now()), (u2, 'zz-j-u2@example.com', null), (u3, 'zz-j-u3@example.com', now()),
    (ops, 'zz-j-ops@example.com', now()), (sup, 'zz-j-sup@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (u1, 'مورد'), (u2, 'غير مؤكد'), (u3, 'موقوف'), (ops, 'عمليات'), (sup, 'دعم');
  update public.ap_profiles set status = 'suspended' where user_id = u3;
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (sup, 'support_agent');

  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_partner_self_register('Henghui Auto Parts', 'CN', array['supplier']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J1 الزائر بلا حساب لا يسجّل منشأة');

  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_partner_self_register('Henghui Auto Parts', 'CN', array['supplier']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J2 البريد غير المؤكد لا يسجّل');
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_partner_self_register('Suspended Co', 'CN', array['supplier']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J3 الحساب الموقوف لا يسجّل');

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_partner_self_register('Henghui Auto Parts', 'CN', array['broker']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J4 صفة الوسيط لا تُطلب ذاتيًا');
  ok := false; begin perform public.ap_partner_self_register('Henghui Auto Parts', 'CN', '{}'::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J5 لا بد من صفة واحدة على الأقل');
  ok := false; begin perform public.ap_partner_self_register('H', 'China', array['supplier']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J6 الاسم والدولة يُتحقق منهما');

  app := public.ap_partner_self_register(' Henghui Auto Parts ', 'cn', array['supplier', 'manufacturer', 'supplier']::public.ap_capability[], 'en');
  select a.organization_id into org from public.ap_partner_applications a where a.id = app;
  select o.status::text || '/' || o.country_code || '/' || o.preferred_locale || '/' || o.legal_name into x from public.ap_organizations o where o.id = org;
  out := array_append(out, (case when x = 'pending/CN/en/Henghui Auto Parts' then 'PASS' else 'FAIL' end) || ' J7 منشأة معلّقة بالدولة واللغة (' || coalesce(x, '-') || ')');
  select count(*) into n from public.ap_organization_verifications where organization_id = org and status = 'requested';
  select n * 10 + count(*) into n from public.ap_organization_members where organization_id = org and user_id = u1 and member_role = 'owner';
  out := array_append(out, (case when n = 21 then 'PASS' else 'FAIL' end) || ' J8 صفتان مطلوبتان (بلا تكرار) والمستخدم مالك');
  select a.status::text || '/' || coalesce(a.invitation_id::text, 'self') || '/' || a.contact_email into x from public.ap_partner_applications a where a.id = app;
  out := array_append(out, (case when x = 'draft_application/self/zz-j-u1@example.com' then 'PASS' else 'FAIL' end) || ' J9 طلب اعتماد مسودة بلا دعوة وبريد صاحبه');
  ok := false; begin perform public.ap_partner_self_register('Second Co', 'CN', array['seller']::public.ap_capability[], 'en'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' J11 منشأة واحدة لكل حساب');

  -- الإرسال يُشعر فريق الاعتماد فقط
  reset role;
  out := array_append(out, (case when not ap_private.org_can_sell(org) then 'PASS' else 'FAIL' end) || ' J10 لا بيع قبل اعتماد الإدارة');
  update public.ap_partner_applications set status = 'submitted_for_review', submitted_at = now() where id = app;
  select count(*) into n from public.ap_notifications where kind = 'partner_application_submitted' and user_id = ops and payload->>'application_id' = app::text
    and payload->>'reference' = 'Henghui Auto Parts' and payload->>'invited' = 'false';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' J12 مدير العمليات يصله إشعار بالطلب الجديد');
  select count(*) into n from public.ap_notifications where kind = 'partner_application_submitted' and user_id in (sup, u1);
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' J13 الدعم الفني والمتقدّم لا يصلهم هذا الإشعار');
  update public.ap_partner_applications set contact_name = 'Eliwa' where id = app;
  select count(*) into n from public.ap_notifications where kind = 'partner_application_submitted' and user_id = ops;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' J14 تعديل الطلب دون تغيير حالته لا يكرر الإشعار');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
