-- إصلاحات المراجعة الأمنية (ترحيل 20261026090000_ap_security_fixes): اختبار لكل ثغرة.
-- عميل (cu)، مورد (sa)، عمليات (ops)، مالية (fin)، دعم (sup)، ناقل (ca)، مستخدم موقوف (cs).
do $$
declare
  cu uuid := gen_random_uuid(); sa uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); fin uuid := gen_random_uuid();
  sup uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cs uuid := gen_random_uuid();
  org_a uuid; org_k uuid; brand uuid; req uuid; sq uuid; cq uuid; ord uuid; shp uuid; num numeric;
  n int; ok boolean; x text; j jsonb; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (cu, 'zz-f-cu@example.com', now()), (sa, 'zz-f-sa@example.com', now()), (ops, 'zz-f-ops@example.com', now()),
    (fin, 'zz-f-fin@example.com', now()), (sup, 'zz-f-sup@example.com', now()), (ca, 'zz-f-ca@example.com', now()),
    (cs, 'zz-f-cs@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (cu, 'عميل'), (sa, 'مورد'), (ops, 'عمليات'), (fin, 'مالية'),
    (sup, 'دعم'), (ca, 'ناقل'), (cs, 'موقوف');
  update public.ap_profiles set status = 'suspended' where user_id = cs;
  insert into public.ap_user_preferences (user_id) values (cs) on conflict do nothing;
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (fin, 'finance_admin'), (sup, 'support_agent');
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد F', 'CN', 'active') returning id into org_a;
  insert into public.ap_organizations (legal_name, country_code, status) values ('ناقل F', 'CN', 'active') returning id into org_k;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, sa, 'owner'), (org_k, ca, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values
    (org_a, 'supplier', 'approved'), (org_k, 'carrier', 'approved');
  select id into brand from public.ap_vehicle_brands where slug = 'geely';
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  req := public.ap_create_quote_request(brand, null, 2023, null, 'LVVDB11B0ND654321', 'P-88', 'مصباح أمامي', 1, 'جدة', 'عميل', '+966500000009', true);
  reset role;
  insert into storage.objects (bucket_id, name) values ('ap-request-media', cu::text || '/' || req::text || '/plate.jpg');
  insert into public.ap_quote_request_media (request_id, storage_path, mime_type) values (req, cu::text || '/' || req::text || '/plate.jpg', 'image/jpeg');
  set local role authenticated;

  -- ───────── ملاحظات الإدارة لا تصل للعميل ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_update_request_status(req, 'reviewing', 'ملاحظة داخلية: العميل كثير الإلغاء');
  select count(*) into n from public.ap_quote_request_notes where request_id = req;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' N1 الإدارة تحفظ ملاحظاتها وتقرؤها');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_quote_request_notes;
  select count(*) + n into n from information_schema.columns where table_name = 'ap_quote_requests' and column_name = 'admin_notes';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' N2 العميل لا يقرأ ملاحظات الإدارة');

  -- ───────── صور الطلب لا تصل للمورد إلا بمشاركة صريحة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a]);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select media_count, vin into n, x from public.ap_supplier_requests(req);
  out := array_append(out, (case when n = 0 and x is null then 'PASS' else 'FAIL' end) || ' M1 المورد لا يعرف عدد الصور ولا الهيكل بلا مشاركة');
  select count(*) into n from storage.objects where bucket_id = 'ap-request-media';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' M2 المورد لا يقرأ ملفات الصور من التخزين بلا مشاركة');
  ok := false; begin perform public.ap_supplier_request_media(req); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' M3 دالة صور المورد ترفض بلا مشاركة');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a], false, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'ap-request-media';
  select count(*) + n into n from public.ap_supplier_request_media(req);
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' M4 بعد المشاركة الصريحة يرى المورد الصور');

  -- ───────── عرض المورد يُقفل عند بناء التسعيرة ─────────
  sq := public.ap_submit_supplier_quote(req, org_a, 'genuine', 400, 'SAR', 1, 7, 'CN', now() + interval '10 days');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  cq := public.ap_admin_create_customer_quote(req, sq);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_submit_supplier_quote(req, org_a, 'aftermarket', 900, 'USD', 1, 7, 'CN', now() + interval '10 days'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' Q1 المورد لا يغيّر سعره بعد بناء التسعيرة عليه');
  ok := false; begin perform public.ap_withdraw_supplier_quote(sq); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' Q2 ولا يسحبه');
  reset role;
  select unit_price::text || '/' || status::text into x from public.ap_supplier_quotes where id = sq;
  out := array_append(out, (case when x = '400.00/selected' then 'PASS' else 'FAIL' end) || ' Q3 العرض محفوظ كما بُنيت عليه التسعيرة');
  update public.ap_supplier_quotes set valid_until = now() - interval '1 minute' where id = sq;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_set_quote_lines(cq, '[{"code":"part","unit_amount":400,"source":"supplier_quote","beneficiary":"مورد F"},{"code":"service_fee","unit_amount":40}]');
  ok := false; begin perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'شروط', 'المورد عبر المنصة'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' Q4 لا تصدر تسعيرة على عرض مورد منتهٍ');
  reset role; update public.ap_supplier_quotes set valid_until = now() + interval '10 days' where id = sq; set local role authenticated;
  perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'شروط', 'المورد عبر المنصة');
  select count(*) into n from public.ap_admin_quote_line_details(req) where source = 'supplier_quote' and beneficiary = 'مورد F';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' L1 الإدارة تقرأ مصدر البند والمستفيد');

  -- ───────── العميل لا يرى الحقول الداخلية لبنود التسعيرة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select sum(amount) into num from public.ap_customer_quote_lines where quote_id = cq;
  out := array_append(out, (case when num = 440 then 'PASS' else 'FAIL' end) || ' L2 العميل يقرأ مبالغ بنود تسعيرته');
  ok := false; begin perform source from public.ap_customer_quote_lines limit 1; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' L3 العميل لا يقرأ مصدر البند');
  ok := false; begin perform beneficiary from public.ap_customer_quote_lines limit 1; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' L4 العميل لا يقرأ المستفيد');
  ok := false; begin perform public.ap_admin_quote_line_details(req); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' L5 العميل لا يستدعي تفاصيل البنود الداخلية');
  ord := public.ap_accept_customer_quote(cq);

  -- ───────── الدفع والتجهيز ثم الشحنة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  perform public.ap_finance_record_payment(ord, 440, 'SAR', 'bank_transfer', 'TRX-F1', 'المورد');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.ap_supplier_set_order_status(ord, 'processing');
  perform public.ap_supplier_set_order_status(ord, 'ready_to_ship');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  shp := public.ap_admin_create_shipment(ord, null, org_k, null, 'air', 1, 3, null, 'عميل', '+966500000009', 'جدة', 'حي الروضة، شارع 2');

  -- ───────── الناقل لا يقفز المراحل قبل الاستلام ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_update_shipment(shp, 'picked_up', 'TRK-F1'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' R1 الناقل لا يستلم شحنة قبل قبولها');
  ok := false; begin perform public.ap_update_shipment(shp, 'returned'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' R2 لا «مرتجع» قبل استلام الشحنة');
  perform public.ap_update_shipment(shp, 'accepted');
  perform public.ap_update_shipment(shp, 'picked_up', 'TRK-F1');
  perform public.ap_update_shipment(shp, 'out_for_delivery');
  select status::text into x from public.ap_shipments where id = shp;
  out := array_append(out, (case when x = 'out_for_delivery' then 'PASS' else 'FAIL' end) || ' R3 بعد الاستلام تبقى المراحل الوسيطة اختيارية');

  -- ───────── ملفات الشحنة في التخزين تتبع صلاحية سجل المستند ─────────
  insert into storage.objects (bucket_id, name) values ('ap-shipment-docs', shp::text || '/pod.jpg');
  perform public.ap_add_shipment_document(shp, 'proof_of_delivery', shp::text || '/pod.jpg', 'image/jpeg', 'pod.jpg');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('ap-shipment-docs', shp::text || '/waybill.pdf');
  perform public.ap_add_shipment_document(shp, 'waybill', shp::text || '/waybill.pdf', 'application/pdf', 'waybill.pdf');
  insert into storage.objects (bucket_id, name) values ('ap-shipment-docs', shp::text || '/draft.pdf');
  select count(*) into n from storage.objects where bucket_id = 'ap-shipment-docs';
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' D1 العمليات تقرأ كل ملفات الشحنة');
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'ap-shipment-docs';
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' D2 الناقل المسند يقرأ ملفات شحنته');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select string_agg(name, ',') into x from storage.objects where bucket_id = 'ap-shipment-docs';
  out := array_append(out, (case when x = shp::text || '/pod.jpg' then 'PASS' else 'FAIL' end) || ' D3 العميل يقرأ ملف إثبات التسليم فقط (لا البوليصة ولا غير المسجّل)');

  -- ───────── سجل التدقيق: البيانات الشخصية لمن يملك customers.read ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_audit_logs where entity_type in ('ap_quote_requests', 'ap_shipments', 'ap_quote_request_notes');
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' A1 المالية لا تقرأ بيانات العملاء من سجل التدقيق');
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_payments';
  out := array_append(out, (case when n >= 1 then 'PASS' else 'FAIL' end) || ' A2 المالية تقرأ تدقيق الدفعات');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_shipments';
  out := array_append(out, (case when n >= 1 then 'PASS' else 'FAIL' end) || ' A3 العمليات تقرأ سجل الشحنات');

  -- ───────── الدعم الفني لا يقرأ بيانات المنشآت ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_organizations;
  select count(*) + n into n from public.ap_organization_members;
  select count(*) + n into n from public.ap_organization_verifications;
  select count(*) + n into n from public.ap_platform_settings where not is_public;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B1 الدعم لا يقرأ المنشآت وأعضاءها والإعدادات الداخلية');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_organizations where id in (org_a, org_k);
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' B2 العمليات تقرأ المنشآت');

  -- ───────── تشديدات صغيرة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cs, 'role', 'authenticated')::text, true);
  update public.ap_user_preferences set locale = 'en' where user_id = cs;
  reset role;
  select locale into x from public.ap_user_preferences where user_id = cs;
  out := array_append(out, (case when x = 'ar' then 'PASS' else 'FAIL' end) || ' H1 الحساب الموقوف لا يعدّل تفضيلاته');
  select file_size_limit into n from storage.buckets where id = 'ap-verification-docs';
  out := array_append(out, (case when n = 4194304 then 'PASS' else 'FAIL' end) || ' H2 حد ملفات التوثيق 4 ميجابايت');
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform created_by from public.ap_products limit 1; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H3 الزائر لا يقرأ من أنشأ المنتج');
  ok := false; begin perform organization_id from public.ap_products limit 1; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H4 الزائر لا يعرف المنشأة المالكة للمنتج');
  ok := true; begin perform id, name, brand_id from public.ap_products limit 1; exception when others then ok := false; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' H5 الزائر يقرأ بيانات المنتج العامة');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
