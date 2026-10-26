-- ملف الشريك حسب نوعه (فرد/منشأة)، والحساب البنكي الاختياري، وخدمة الشحن قبل الاعتماد.
do $$
declare
  ui uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  ops uuid := gen_random_uuid(); fin uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  app_i uuid; app_c uuid; org_i uuid; org_c uuid; m text[]; n int; ok boolean; x text; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ui, 'zz-k-ind@example.com', now()), (uc, 'zz-k-co@example.com', now()), (ux, 'zz-k-x@example.com', now()),
    (ops, 'zz-k-ops@example.com', now()), (fin, 'zz-k-fin@example.com', now()), (sup, 'zz-k-sup@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (ui, 'فرد'), (uc, 'شركة'), (ux, 'غريب'), (ops, 'عمليات'), (fin, 'مالية'), (sup, 'دعم');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (fin, 'finance_admin'), (sup, 'support_agent');
  set local role authenticated;

  -- ───────── فرد ومنشأة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ui, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_partner_self_register('Ali Saleh', 'SA', array['seller']::public.ap_capability[], 'ar', 'robot'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K1 نوع حساب غير معروف مرفوض');
  app_i := public.ap_partner_self_register('Ali Saleh', 'SA', array['seller']::public.ap_capability[], 'ar', 'individual');
  select a.organization_id, o.account_kind || '/' || a.contact_name into org_i, x
    from public.ap_partner_applications a join public.ap_organizations o on o.id = a.organization_id where a.id = app_i;
  out := array_append(out, (case when x = 'individual/Ali Saleh' then 'PASS' else 'FAIL' end) || ' K2 الفرد: اسمه هو اسم المسؤول (' || x || ')');
  m := public.ap_application_missing(app_i);
  out := array_append(out, (case when 'identity_document' = any(m) and not ('registration_number' = any(m)) and not ('contact_name' = any(m))
    and not ('registration_document' = any(m)) then 'PASS' else 'FAIL' end) || ' K3 الفرد يُطلب منه إثبات هوية لا سجل تجاري');

  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  app_c := public.ap_partner_self_register('Ningbo Freight Co', 'CN', array['carrier']::public.ap_capability[], 'en');
  select organization_id into org_c from public.ap_partner_applications where id = app_c;
  m := public.ap_application_missing(app_c);
  out := array_append(out, (case when array['registration_number', 'contact_name', 'registration_document', 'registered_address', 'carrier_services'] <@ m
    and not ('identity_document' = any(m)) then 'PASS' else 'FAIL' end) || ' K4 المنشأة: سجل ومسؤول وعنوان، والناقل خدمة شحن (' || array_to_string(m, ',') || ')');
  perform public.ap_save_application(app_c, jsonb_build_object('legal_name', 'Ningbo Freight Co', 'country_code', 'CN', 'city', 'Ningbo',
    'registered_address', 'Beilun, Ningbo', 'registration_number', '91330200XX', 'vat_number', '', 'activity_description', 'شحن بحري وجوي',
    'contact_name', 'Chen', 'contact_phone', '+86 139 0000 0000', 'contact_email', 'chen@example.com', 'declaration', true), null);
  ok := false; begin perform public.ap_save_carrier_service(null, org_c, 'جوي', 'air', array['CN'], array['SA'], 5, 9, null, true, 30, null, null, null); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K5 سعر الكيلو بلا عملة مرفوض');
  perform public.ap_save_carrier_service(null, org_c, 'جوي', 'air', array['CN'], array['SA'], 5, 9, null, true, 30, 'cny', 150, 'Ningbo warehouse');
  select price_per_kg || '/' || price_currency || '/' || min_charge || '/' || pickup_location into x from public.ap_carrier_services where organization_id = org_c;
  out := array_append(out, (case when x = '30.00/CNY/150.00/Ningbo warehouse' then 'PASS' else 'FAIL' end) || ' K6 الناقل يضيف التكلفة وموقع الاستلام قبل الاعتماد');
  m := public.ap_application_missing(app_c);
  out := array_append(out, (case when array['registration_document', 'documents'] <@ m and not ('carrier_services' = any(m))
    and not ('registration_number' = any(m)) then 'PASS' else 'FAIL' end) || ' K7 بعد التعبئة يبقى المستند فقط (' || array_to_string(m, ',') || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_application_missing(app_c); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K8 غريب لا يرى نواقص طلب غيره');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := true; begin perform public.ap_application_missing(app_c); exception when others then ok := false; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K9 فريق الاعتماد يرى النواقص');

  -- ───────── الحساب البنكي ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_save_bank_account(org_c, 'Bank of China', 'Ningbo Freight Co', 'not-an-iban', null, null, 'USD'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K10 آيبان غير صحيح مرفوض');
  perform public.ap_save_bank_account(org_c, 'Bank of China', 'Ningbo Freight Co', null, '6217 0000 1234', 'bkchcnbj', 'usd');
  perform set_config('request.jwt.claims', json_build_object('sub', ui, 'role', 'authenticated')::text, true);
  perform public.ap_save_bank_account(org_i, 'Al Rajhi', 'Ali Saleh', 'sa03 8000 0000 6080 1016 7519', null, null, 'SAR');
  select iban into x from public.ap_organization_bank_accounts where organization_id = org_i;
  out := array_append(out, (case when x = 'SA0380000000608010167519' then 'PASS' else 'FAIL' end) || ' K11 الآيبان يُحفظ بلا مسافات وبأحرف كبيرة');
  select count(*) into n from public.ap_organization_bank_accounts;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' K12 الشريك يرى حسابه البنكي فقط');
  ok := false; begin perform public.ap_save_bank_account(org_c, 'Hack', 'Hack', 'SA0380000000608010167519', null, null, 'SAR'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' K13 لا يعدّل حساب منشأة غيره');
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_organization_bank_accounts;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select n * 10 + count(*) into n from public.ap_organization_bank_accounts;
  out := array_append(out, (case when n = 22 then 'PASS' else 'FAIL' end) || ' K14 المالية وفريق الاعتماد يقرؤون الحسابات');
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_organization_bank_accounts;
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  select n + count(*) into n from public.ap_organization_bank_accounts;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' K15 الدعم الفني وغيرهم لا يرون الحسابات البنكية');
  perform set_config('request.jwt.claims', json_build_object('sub', ui, 'role', 'authenticated')::text, true);
  perform public.ap_save_bank_account(org_i, '', '', null, null, null, null);
  reset role;
  select count(*) into n from public.ap_organization_bank_accounts where organization_id = org_i;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' K16 مسح الحساب البنكي (اختياري)');
  select count(*) into n from public.ap_audit_logs where details::text ~ '(608010167519|6217 ?0000 ?1234|BKCHCNBJ)';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' K17 أرقام الحساب لا تُكتب في سجل التدقيق');
  select count(*) into n from public.ap_audit_logs where action = 'bank_account_updated';
  out := array_append(out, (case when n >= 3 then 'PASS' else 'FAIL' end) || ' K18 كل تعديل للحساب مسجّل');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
