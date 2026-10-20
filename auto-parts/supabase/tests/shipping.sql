-- المرحلة D: خدمات الناقل، عروض الشحن، منع ازدواج الشحن، الدفع اليدوي، انتقالات الطلب، الشحنات، التقارير.
-- عميل (cu)، عميل آخر (cx)، عمليات (ops)، مالية (fin)، دعم (sup)، مورد (sa)، ناقل معتمد (ca)، ناقل آخر (cb)، ناقل غير معتمد (cc).
do $$
declare
  cu uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); fin uuid := gen_random_uuid();
  sup uuid := gen_random_uuid(); sa uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  org_a uuid; org_k uuid; org_l uuid; org_c uuid; brand uuid; req uuid; sq uuid; cq uuid; shq uuid; shq2 uuid; ord uuid; shp uuid; svc uuid;
  n int; ok boolean; x text; num numeric; j jsonb; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (cu, 'zz-s-cu@example.com', now()), (cx, 'zz-s-cx@example.com', now()), (ops, 'zz-s-ops@example.com', now()),
    (fin, 'zz-s-fin@example.com', now()), (sup, 'zz-s-sup@example.com', now()), (sa, 'zz-s-a@example.com', now()),
    (ca, 'zz-s-ca@example.com', now()), (cb, 'zz-s-cb@example.com', now()), (cc, 'zz-s-cc@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (cu, 'عميل'), (cx, 'عميل آخر'), (ops, 'عمليات'), (fin, 'مالية'),
    (sup, 'دعم'), (sa, 'مورد'), (ca, 'ناقل'), (cb, 'ناقل آخر'), (cc, 'ناقل غير معتمد');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (fin, 'finance_admin'), (sup, 'support_agent');
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد', 'CN', 'active') returning id into org_a;
  insert into public.ap_organizations (legal_name, country_code, status) values ('ناقل K', 'CN', 'active') returning id into org_k;
  insert into public.ap_organizations (legal_name, country_code, status) values ('ناقل L', 'CN', 'active') returning id into org_l;
  insert into public.ap_organizations (legal_name, country_code, status) values ('ناقل C', 'CN', 'pending') returning id into org_c;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values
    (org_a, sa, 'owner'), (org_k, ca, 'owner'), (org_l, cb, 'owner'), (org_c, cc, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values
    (org_a, 'supplier', 'approved'), (org_k, 'carrier', 'approved'), (org_l, 'carrier', 'approved'), (org_c, 'carrier', 'requested');
  select id into brand from public.ap_vehicle_brands where slug = 'geely';
  set local role authenticated;

  -- ───────── تجهيز طلب تسعير وعرض مورد ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  req := public.ap_create_quote_request(brand, null, 2023, null, 'LVVDB11B0ND123456', 'P-77', 'صدام أمامي', 1, 'الدمام', 'عميل', '+966500000001', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a], false);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  sq := public.ap_submit_supplier_quote(req, org_a, 'genuine', 400, 'SAR', 1, 7, 'CN', now() + interval '10 days');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  cq := public.ap_admin_create_customer_quote(req, sq);

  -- ───────── خدمات الناقل ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  svc := public.ap_save_carrier_service(null, org_k, 'جوي سريع', 'air', array['CN'], array['SA'], 5, 9, null, true);
  out := array_append(out, (case when svc is not null then 'PASS' else 'FAIL' end) || ' A1 الناقل المعتمد يضيف خدمة');
  perform set_config('request.jwt.claims', json_build_object('sub', cc, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_save_carrier_service(null, org_c, 'بحري', 'sea', array['CN'], array['SA'], 20, 40, null, true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A2 ناقل غير معتمد لا يضيف خدمات');
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_save_carrier_service(svc, org_l, 'تعديل', 'air', array['CN'], array['SA'], 1, 2, null, true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A3 ناقل لا يعدّل خدمة ناقل آخر');

  -- ───────── عروض الشحن ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_request_shipping_quote(req, org_k, 'air', 'CN', 'Guangzhou', null, 1, 12); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B1 الدعم لا يطلب عروض شحن');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_request_shipping_quote(req, org_c, 'air', 'CN', 'Guangzhou', null, 1, 12); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B2 لا يُطلب عرض من ناقل غير معتمد');
  shq := public.ap_admin_request_shipping_quote(req, org_k, 'air', 'cn', 'Guangzhou', null, 1, 12, 18, 120, 60, 40);
  select destination_city into x from public.ap_shipping_quotes where id = shq;
  out := array_append(out, (case when x = 'الدمام' then 'PASS' else 'FAIL' end) || ' B3 الوجهة الافتراضية مدينة العميل');

  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  select to_jsonb(t) into j from public.ap_carrier_shipping_quotes(shq) t;
  out := array_append(out, (case when j is not null and not (j ? 'vin') and not (j ? 'contact_phone') and not (j ? 'contact_name')
    and not (j ? 'unit_price') then 'PASS' else 'FAIL' end) || ' B4 الناقل يرى الطرد والمسار فقط');
  select count(*) into n from public.ap_quote_requests;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B5 الناقل لا يقرأ طلبات العملاء');
  ok := false; begin perform public.ap_carrier_submit_shipping_quote(shq, 300, 'CNY', 8, now() - interval '1 day'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B6 عرض شحن بصلاحية ماضية مرفوض');
  perform public.ap_carrier_submit_shipping_quote(shq, 300, 'CNY', 8, now() + interval '5 days', 'K-REF-1');
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_shipping_quotes;
  select count(*) + n into n from public.ap_carrier_shipping_quotes();
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B7 ناقل آخر لا يرى العرض');
  ok := false; begin perform public.ap_carrier_submit_shipping_quote(shq, 1, 'SAR', 1, now() + interval '5 days'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B8 ناقل آخر لا يسعّر عرضًا ليس له');

  -- ───────── اعتماد عرض الشحن في التسعيرة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_apply_shipping_quote(shq, cq); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C1 عرض بعملة أخرى يحتاج تحويلًا موثقًا');
  perform public.ap_admin_apply_shipping_quote(shq, cq, 156.40, 'سعر صرف البنك 0.5213 بتاريخ اليوم');
  perform public.ap_admin_apply_shipping_quote(shq, cq, 156.40, 'سعر صرف البنك 0.5213 بتاريخ اليوم');
  select count(*), max(unit_amount) into n, num from public.ap_customer_quote_lines where quote_id = cq and code = 'international_shipping';
  out := array_append(out, (case when n = 1 and num = 156.40 then 'PASS' else 'FAIL' end) || ' C2 الاعتماد المتكرر لا يكرر بند الشحن');
  shq2 := public.ap_admin_add_shipping_quote(req, 'ناقل خارجي', 'express', 'CN', 'Shenzhen', null, 1, 12, 15, 140, 'SAR', 6, now() + interval '5 days', 'EXT-9');
  perform public.ap_admin_apply_shipping_quote(shq2, cq);
  select count(*), max(unit_amount) into n, num from public.ap_customer_quote_lines where quote_id = cq and code = 'international_shipping';
  select status::text into x from public.ap_shipping_quotes where id = shq;
  out := array_append(out, (case when n = 1 and num = 140 and x = 'submitted' then 'PASS' else 'FAIL' end) || ' C3 عرض جديد يستبدل السابق');
  perform public.ap_admin_set_quote_lines(cq, '[{"code":"part","unit_amount":400},{"code":"international_shipping","unit_amount":140},
    {"code":"international_shipping","unit_amount":140},{"code":"service_fee","unit_amount":40}]');
  ok := false; begin perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'شروط', 'المورد عبر المنصة'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C4 لا تصدر تسعيرة فيها الشحن مرتين');
  perform public.ap_admin_set_quote_lines(cq, '[{"code":"part","unit_amount":400},{"code":"international_shipping","unit_amount":140,"source":"shipping_quote"},
    {"code":"service_fee","unit_amount":40},{"code":"discount","unit_amount":-10}]');
  perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'شروط', 'المورد عبر المنصة');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ord := public.ap_accept_customer_quote(cq);
  select supplier_org_id::text || '/' || shipping_quote_id::text into x from public.ap_orders where id = ord;
  out := array_append(out, (case when x = org_a::text || '/' || shq2::text then 'PASS' else 'FAIL' end) || ' C5 الطلب يُربط بالمورد وعرض الشحن المعتمد');
  select count(*) into n from public.ap_shipping_quotes;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C6 العميل لا يرى عروض الشحن الداخلية');

  -- ───────── الدفع اليدوي ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_create_shipment(ord, shq2, null, null, null, null, null, null, 'عميل', '+966500000001', 'الدمام', 'حي الشاطئ، شارع 1'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D1 لا شحن قبل الدفع');
  ok := false; begin perform public.ap_finance_record_payment(ord, 570, 'SAR', 'bank_transfer', 'TRX-1', 'المورد'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D2 مدير العمليات لا يسجّل دفعًا');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_finance_record_payment(ord, 570, 'SAR', 'bank_transfer', 'TRX-1', 'المورد'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D3 العميل لا يزوّر الدفع');
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_finance_record_payment(ord, 500, 'SAR', 'bank_transfer', 'TRX-1', 'المورد'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D4 مبلغ لا يطابق الإجمالي مرفوض');
  perform public.ap_finance_record_payment(ord, 570, 'SAR', 'bank_transfer', 'TRX-1', 'المورد');
  select status::text || '/' || payment_status into x from public.ap_orders where id = ord;
  out := array_append(out, (case when x = 'paid/paid' then 'PASS' else 'FAIL' end) || ' D5 تسجيل الدفع ينقل الطلب إلى مدفوع');
  ok := false; begin perform public.ap_finance_record_payment(ord, 570, 'SAR', 'bank_transfer', 'TRX-2', 'المورد'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D6 لا يُسجَّل الدفع مرتين');

  -- ───────── تجهيز المورد ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select to_jsonb(t) into j from public.ap_supplier_orders(ord) t;
  out := array_append(out, (case when j is not null and not (j ? 'customer_id') and not (j ? 'total') and not (j ? 'contact_phone') then 'PASS' else 'FAIL' end)
    || ' E1 المورد يرى طلبه بلا بيانات العميل ولا الإجمالي');
  ok := false; begin perform public.ap_supplier_set_order_status(ord, 'delivered'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E2 المورد لا يقفز إلى حالة غير مسموحة');
  perform public.ap_supplier_set_order_status(ord, 'processing');
  perform public.ap_supplier_set_order_status(ord, 'ready_to_ship');
  reset role; select count(*) into n from public.ap_order_status_history where order_id = ord; set local role authenticated;
  out := array_append(out, (case when n = 4 then 'PASS' else 'FAIL' end) || ' E3 كل انتقال محفوظ في التاريخ');
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_supplier_set_order_status(ord, 'processing'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E4 غير المورد لا يغيّر حالة الطلب');

  -- ───────── الشحنة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_create_shipment(ord, null, org_c, null, 'air', 1, 12, null, 'عميل', '+966500000001', 'الدمام', 'حي الشاطئ، شارع 1'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F1 لا إسناد لناقل غير معتمد');
  shp := public.ap_admin_create_shipment(ord, shq2, org_k, null, null, null, null, null, 'عميل', '+966500000001', 'الدمام', 'حي الشاطئ، شارع 1', 6);
  select reference, weight_kg into x, num from public.ap_shipments where id = shp;
  out := array_append(out, (case when x like 'SHP-%' and num = 12 then 'PASS' else 'FAIL' end) || ' F2 الشحنة تأخذ بيانات الطرد من عرض الشحن');
  ok := false; begin perform public.ap_admin_create_shipment(ord, null, org_k, null, 'air', 1, 12, null, 'عميل', '+966500000001', 'الدمام', 'حي الشاطئ، شارع 1'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F3 شحنة نشطة واحدة لكل طلب');

  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_shipments;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' F4 ناقل آخر لا يرى الشحنة');
  ok := false; begin perform public.ap_update_shipment(shp, 'accepted'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F5 ناقل آخر لا يحدّث الشحنة');

  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_shipments where id = shp and recipient_phone = '+966500000001';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' F6 الناقل المسند يرى بيانات التسليم');
  select count(*) into n from public.ap_orders;
  select count(*) + n into n from public.ap_order_items;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' F7 الناقل لا يرى الطلب ولا أسعاره');
  perform public.ap_update_shipment(shp, 'accepted');
  ok := false; begin perform public.ap_update_shipment(shp, 'picked_up'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F8 لا استلام بلا رقم تتبع');
  perform public.ap_update_shipment(shp, 'picked_up', 'TRK123456', 'Guangzhou');
  reset role; select status::text into x from public.ap_orders where id = ord; set local role authenticated;
  out := array_append(out, (case when x = 'shipped' then 'PASS' else 'FAIL' end) || ' F9 حالة الطلب تتبع الشحنة (تم الشحن)');
  ok := false; begin perform public.ap_update_shipment(shp, 'accepted'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F10 لا رجوع في مراحل الشحنة');
  perform public.ap_update_shipment(shp, 'customs_clearance', null, 'الدمام');
  perform public.ap_update_shipment(shp, 'out_for_delivery');
  ok := false; begin perform public.ap_update_shipment(shp, 'delivered'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F11 الناقل يحتاج إثبات تسليم قبل «تم التسليم»');
  insert into storage.objects (bucket_id, name) values ('ap-shipment-docs', shp::text || '/pod.jpg');
  perform public.ap_add_shipment_document(shp, 'proof_of_delivery', shp::text || '/pod.jpg', 'image/jpeg', 'pod.jpg');
  perform public.ap_update_shipment(shp, 'delivered', null, 'الدمام', 'استلمه العميل');
  reset role; select status::text into x from public.ap_orders where id = ord; select count(*) into n from public.ap_shipment_events where shipment_id = shp; set local role authenticated;
  out := array_append(out, (case when x = 'delivered' and n = 6 then 'PASS' else 'FAIL' end) || ' F12 التسليم يُحدّث الطلب وكل حدث محفوظ');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('ap-shipment-docs', shp::text || '/waybill.pdf');
  perform public.ap_add_shipment_document(shp, 'waybill', shp::text || '/waybill.pdf', 'application/pdf', 'waybill.pdf');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_shipment_documents where shipment_id = shp;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' F13 العميل يرى إثبات التسليم فقط من المستندات');
  select count(*) into n from public.ap_shipment_events where shipment_id = shp;
  out := array_append(out, (case when n = 6 then 'PASS' else 'FAIL' end) || ' F14 العميل يتابع أحداث شحنته');
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_shipments;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' F15 عميل آخر لا يرى الشحنة');
  ok := false; begin perform public.ap_customer_confirm_delivery(ord); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F16 عميل آخر لا يؤكد الاستلام');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  perform public.ap_customer_confirm_delivery(ord);
  select status::text into x from public.ap_orders where id = ord;
  out := array_append(out, (case when x = 'completed' then 'PASS' else 'FAIL' end) || ' F17 العميل يؤكد الاستلام فيكتمل الطلب');

  -- ───────── التقارير ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_report_summary(current_date - 1, current_date); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' G1 الدعم لا يقرأ التقارير');
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  j := public.ap_report_summary(current_date - 1, current_date);
  out := array_append(out, (case when (j->'money'->0->>'gmv')::numeric = 570 and (j->'money'->0->>'service_fee')::numeric = 40
    and (j->'money'->0->>'net_service_income')::numeric = 30 and (j->>'orders')::int = 1 then 'PASS' else 'FAIL' end)
    || ' G2 التقرير يفصل قيمة الطلبات عن رسوم الخدمة وصافيها');
  select to_jsonb(t) into j from public.ap_report_orders(current_date - 1, current_date) t;
  out := array_append(out, (case when (j->>'total')::numeric = 570 and (j->>'shipping_amount')::numeric = 140 and not (j ? 'contact_phone')
    and not (j ? 'customer_id') then 'PASS' else 'FAIL' end) || ' G3 تصدير الطلبات بلا بيانات شخصية');

  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_platform_settings where key = 'service_fee_percent';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' G4 نسبة رسوم الخدمة ليست علنية');
  reset role;
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_payments';
  out := array_append(out, (case when n >= 1 then 'PASS' else 'FAIL' end) || ' G5 تسجيل الدفع في سجل التدقيق');

  -- ───────── التتبع العام (بلا تسجيل دخول) ─────────
  select reference into x from public.ap_orders where id = ord;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  j := public.ap_track_order(lower(x), '+966500000001');
  out := array_append(out, (case when j->>'reference' = x and j->'shipment'->>'status' = 'delivered'
    and jsonb_array_length(j->'shipment'->'events') = 6 then 'PASS' else 'FAIL' end) || ' T1 الزائر يتتبع طلبه برقم الطلب والجوال');
  out := array_append(out, (case when j::text !~ '(total|amount|price|recipient|address|contact|عميل|حي الشاطئ|966)' then 'PASS' else 'FAIL' end)
    || ' T2 لا أسعار ولا أسماء ولا عناوين ولا جوال في نتيجة التتبع');
  out := array_append(out, (case when public.ap_track_order(x, '+966511111111') is null then 'PASS' else 'FAIL' end) || ' T3 جوال خاطئ لا يكشف شيئًا');
  out := array_append(out, (case when public.ap_track_order('ORD-1', '+966500000001') is null then 'PASS' else 'FAIL' end) || ' T4 رقم بصيغة غير صحيحة');
  for n in 1..9 loop perform public.ap_track_order(x, '+9667' || lpad(n::text, 8, '0')); end loop;
  ok := false; begin perform public.ap_track_order(x, '+966500000001'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' T5 بعد 10 محاولات خاطئة يُقفل التتبع لهذا الطلب حتى بالجوال الصحيح');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
