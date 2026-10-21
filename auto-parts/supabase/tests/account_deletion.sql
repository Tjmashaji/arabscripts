-- حذف الحساب بطلب صاحبه: ما يُحذف، وما يبقى بلا هوية، ومن لا يستطيع الحذف بنفسه.
-- عميل (cu) له طلب مكتمل وطلب مفتوح، عميل آخر (cx)، عمليات (ops)، مالية (fin)، مورد مالك منشأة (sa)، ناقل (ca).
do $$
declare
  cu uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); fin uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); ca uuid := gen_random_uuid();
  org_a uuid; org_k uuid; brand uuid; req uuid; req2 uuid; reqx uuid; sq uuid; cq uuid; ord uuid; shp uuid;
  n int; ok boolean; x text; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (cu, 'zz-d-cu@example.com', now()), (cx, 'zz-d-cx@example.com', now()), (ops, 'zz-d-ops@example.com', now()),
    (fin, 'zz-d-fin@example.com', now()), (sa, 'zz-d-sa@example.com', now()), (ca, 'zz-d-ca@example.com', now());
  insert into public.ap_profiles (user_id, full_name, phone) values (cu, 'عميل سيُحذف', '+966500000077'), (cx, 'عميل باقٍ', null),
    (ops, 'عمليات', null), (fin, 'مالية', null), (sa, 'مورد', null), (ca, 'ناقل', null);
  insert into public.ap_user_preferences (user_id) values (cu) on conflict do nothing;
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (fin, 'finance_admin');
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد D', 'CN', 'active') returning id into org_a;
  insert into public.ap_organizations (legal_name, country_code, status) values ('ناقل D', 'CN', 'active') returning id into org_k;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, sa, 'owner'), (org_k, ca, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values
    (org_a, 'supplier', 'approved'), (org_k, 'carrier', 'approved');
  select id into brand from public.ap_vehicle_brands where slug = 'geely';
  set local role authenticated;

  -- ───────── تجهيز: طلب يصل إلى شحنة، وطلب ثانٍ مفتوح، وطلب لعميل آخر ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  req := public.ap_create_quote_request(brand, null, 2023, null, 'LVVDB11B0ND777777', 'P-1', 'رديتر', 1, 'الرياض', 'عميل سيُحذف', '+966500000077', true);
  req2 := public.ap_create_quote_request(brand, null, 2022, null, null, null, 'فلتر زيت', 2, 'الرياض', 'عميل سيُحذف', '+966500000077', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  reqx := public.ap_create_quote_request(brand, null, 2021, null, null, null, 'مساعد', 1, 'جدة', 'عميل باقٍ', '+966500000088', true);
  reset role;
  insert into storage.objects (bucket_id, name) values ('ap-request-media', cu::text || '/' || req::text || '/a.jpg'),
    ('ap-request-media', cx::text || '/' || reqx::text || '/b.jpg');
  insert into public.ap_quote_request_media (request_id, storage_path, mime_type) values (req, cu::text || '/' || req::text || '/a.jpg', 'image/jpeg');
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_update_request_status(req, 'reviewing', 'ملاحظة: العميل رقمه +966500000077');
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a]);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  sq := public.ap_submit_supplier_quote(req, org_a, 'genuine', 300, 'SAR', 1, 7, 'CN', now() + interval '10 days');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  cq := public.ap_admin_create_customer_quote(req, sq);
  perform public.ap_admin_set_quote_lines(cq, '[{"code":"part","unit_amount":300},{"code":"service_fee","unit_amount":30}]');
  perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'شروط', 'المورد عبر المنصة');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ord := public.ap_accept_customer_quote(cq);
  perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
  perform public.ap_finance_record_payment(ord, 330, 'SAR', 'bank_transfer', 'TRX-D1', 'المورد');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.ap_supplier_set_order_status(ord, 'processing');
  perform public.ap_supplier_set_order_status(ord, 'ready_to_ship');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  shp := public.ap_admin_create_shipment(ord, null, org_k, null, 'air', 1, 3, null, 'عميل سيُحذف', '+966500000077', 'الرياض', 'حي الملقا، شارع 9');

  -- ───────── من لا يحذف حسابه بنفسه ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_delete_my_account(); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D1 حساب الإدارة لا يُحذف ذاتيًا');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_delete_my_account(); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D2 مالك المنشأة لا يحذف حسابه ذاتيًا');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_delete_my_account(); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D3 لا حذف والطلب لم يكتمل');
  x := public.ap_account_deletion_blocker();
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  x := x || '/' || public.ap_account_deletion_blocker();
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  x := x || '/' || public.ap_account_deletion_blocker();
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  x := x || '/' || coalesce(public.ap_account_deletion_blocker(), 'none');
  out := array_append(out, (case when x = 'open_orders/staff_account/organization_owner/none' then 'PASS' else 'FAIL' end)
    || ' D3b التطبيق يعرف سبب المنع قبل أي حذف (' || x || ')');
  reset role;
  select count(*) into n from auth.users where id = cu;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D4 الرفض لا يغيّر شيئًا');
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_delete_my_account(); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D5 الزائر لا يستدعي الحذف');

  -- ───────── صور الطلب: صاحبها فقط يحذفها من التخزين ─────────
  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'ap-request-media' and name like cx::text || '/%';
  reset role; select count(*) into n from storage.objects where name like cx::text || '/%'; set local role authenticated;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D6 العميل لا يحذف صور عميل آخر');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'ap-request-media' and name like cu::text || '/%';
  reset role; select count(*) into n from storage.objects where name like cu::text || '/%';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D7 العميل يحذف صور طلباته');

  -- ───────── الحذف بعد اكتمال الطلب ─────────
  update public.ap_orders set status = 'completed' where id = ord;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  perform public.ap_delete_my_account();
  reset role;
  select count(*) into n from auth.users where id = cu;
  select count(*) + n into n from public.ap_profiles where user_id = cu;
  select count(*) + n into n from public.ap_user_preferences where user_id = cu;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D8 الحساب والملف والتفضيلات حُذفت');
  select count(*) into n from public.ap_quote_requests where id in (req, req2) and customer_id is null and contact_name is null
    and contact_phone is null and vin is null;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' D9 الطلبات بلا صاحب ولا اسم ولا جوال ولا رقم هيكل');
  select status::text into x from public.ap_quote_requests where id = req2;
  out := array_append(out, (case when x = 'cancelled' then 'PASS' else 'FAIL' end) || ' D10 الطلب المفتوح أُلغي');
  select count(*) into n from public.ap_quote_request_media where request_id = req;
  select count(*) + n into n from public.ap_quote_request_notes where request_id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D11 صور الطلب وملاحظات الإدارة عنه حُذفت');
  select count(*) into n from public.ap_orders o join public.ap_payments p on p.order_id = o.id where o.id = ord and o.customer_id is null and o.total = 330;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D12 الطلب والدفعة باقيان للسجلات بلا صاحب');
  select count(*) into n from public.ap_shipments where id = shp and recipient_name is null and recipient_phone is null
    and destination_address is null and destination_city = 'الرياض';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D13 الشحنة بلا اسم المستلم وجواله وعنوانه');
  select count(*) into n from public.ap_audit_logs
    where details::text ~ '(966500000077|LVVDB11B0ND777777|حي الملقا|عميل سيُحذف|ملاحظة: العميل)';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D14 سجل التدقيق لا يحتفظ ببيانات الحساب المحذوف' || case when n > 0 then ' (' || n || ')' else '' end);
  select count(*) into n from public.ap_audit_logs where action = 'account_deleted' and entity_id = cu::text;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D15 الحذف نفسه مسجّل في التدقيق');
  select count(*) into n from public.ap_quote_requests where id = reqx and customer_id = cx and contact_phone = '+966500000088';
  select count(*) + n into n from auth.users where id = cx;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' D16 بيانات العملاء الآخرين لم تتأثر');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
