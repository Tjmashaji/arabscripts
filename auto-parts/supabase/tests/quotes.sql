-- المرحلة C: طلبات التسعير، عروض الموردين، تسعيرة العميل المفصّلة بإصدارات، والموافقة وإنشاء طلب الشراء.
-- عميل (cu)، عميل آخر (cx)، مدير عمليات (ops)، دعم فني (sup)، مورد معتمد مدعو (sa)، مورد معتمد غير مدعو (sb)، منشأة غير معتمدة (sc).
do $$
declare
  cu uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid(); sc uuid := gen_random_uuid();
  org_a uuid; org_b uuid; org_c uuid; brand uuid; req uuid; req2 uuid; sq uuid; q1 uuid; q2 uuid; ord uuid;
  n int; ok boolean; x text; b boolean; num numeric; j jsonb; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (cu, 'zz-q-cu@example.com', now()), (cx, 'zz-q-cx@example.com', now()), (ops, 'zz-q-ops@example.com', now()),
    (sup, 'zz-q-sup@example.com', now()), (sa, 'zz-q-a@example.com', now()), (sb, 'zz-q-b@example.com', now()),
    (sc, 'zz-q-c@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (cu, 'عميل'), (cx, 'عميل آخر'), (ops, 'عمليات'), (sup, 'دعم'),
    (sa, 'مورد أ'), (sb, 'مورد ب'), (sc, 'غير معتمد');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (sup, 'support_agent');
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد A', 'CN', 'active') returning id into org_a;
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد B', 'CN', 'active') returning id into org_b;
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد C', 'CN', 'pending') returning id into org_c;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, sa, 'owner'), (org_b, sb, 'owner'), (org_c, sc, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values
    (org_a, 'supplier', 'approved'), (org_b, 'supplier', 'approved'), (org_c, 'supplier', 'requested');
  select id into brand from public.ap_vehicle_brands where slug = 'chery';

  -- ───────── طلب العميل ─────────
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_create_quote_request(brand, null, 2022, null, null, null, 'فلتر هواء', 1, 'الرياض', 'عميل', '+966500000000', true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A1 الزائر لا ينشئ طلب تسعير');
  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_create_quote_request(brand, null, 2022, null, null, null, 'فلتر هواء', 1, 'الرياض', 'عميل', '+966500000000', false); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A2 الطلب بلا موافقة الخصوصية مرفوض');
  ok := false; begin perform public.ap_create_quote_request(brand, null, 2022, null, 'BAD-VIN', null, 'فلتر هواء', 1, 'الرياض', 'عميل', '+966500000000', true); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A3 رقم هيكل غير صالح مرفوض');
  req := public.ap_create_quote_request(brand, null, 2022, '1.5T', 'lvvdb 11b0nd123456', 'F-100', 'فلتر هواء للمحرك', 2, 'الرياض', 'عميل', '+966500000000', true);
  select reference, vin into x, j from (select reference, to_jsonb(vin) as vin from public.ap_quote_requests where id = req) t;
  out := array_append(out, (case when x like 'RQ-%' and j = '"LVVDB11B0ND123456"'::jsonb then 'PASS' else 'FAIL' end) || ' A4 مرجع RQ وتطبيع رقم الهيكل');
  ok := false; begin update public.ap_quote_requests set status = 'accepted' where id = req; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A5 العميل لا يعدّل حالة طلبه مباشرة');

  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_quote_requests where id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' A6 عميل آخر لا يرى الطلب');
  ok := false; begin perform public.ap_cancel_quote_request(req); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A7 عميل آخر لا يلغي الطلب');

  -- ───────── الإرسال للموردين ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_quote_requests where id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B1 المورد لا يقرأ جدول الطلبات مباشرة');
  select count(*) into n from public.ap_supplier_requests();
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B2 المورد لا يرى طلبًا لم يُرسل له');
  ok := false; begin perform public.ap_submit_supplier_quote(req, org_a, 'genuine', 100, 'SAR', 5, 10, 'CN', now() + interval '7 days'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B3 المورد غير المدعو لا يقدّم عرضًا');

  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_send_request_to_suppliers(req, array[org_a], false); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B4 الدعم الفني لا يرسل الطلبات للموردين');
  select count(*) into n from public.ap_quote_requests where id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B5 الدعم الفني لا يرى طلبات التسعير');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_send_request_to_suppliers(req, array[org_c], false); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B6 لا يُرسل الطلب لمنشأة غير معتمدة');
  n := public.ap_admin_send_request_to_suppliers(req, array[org_a], false);
  select status::text into x from public.ap_quote_requests where id = req;
  out := array_append(out, (case when n = 1 and x = 'sourcing' then 'PASS' else 'FAIL' end) || ' B7 الإرسال لمورد معتمد ينقل الطلب إلى sourcing');

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*), bool_and(vin is null) into n, b from public.ap_supplier_requests();
  out := array_append(out, (case when n = 1 and b then 'PASS' else 'FAIL' end) || ' B8 المورد المدعو يرى الطلب بلا رقم الهيكل');
  select count(*) into n from public.ap_notifications where user_id = sa and kind = 'quote_request_invited';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B9 إشعار المورد بالطلب');
  select to_jsonb(r) into j from public.ap_supplier_requests(req) r;
  out := array_append(out, (case when not (j ? 'contact_name') and not (j ? 'contact_phone') and not (j ? 'customer_id') then 'PASS' else 'FAIL' end) || ' B10 لا بيانات اتصال للعميل لدى المورد');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a, org_b], true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select vin into x from public.ap_supplier_requests(req);
  out := array_append(out, (case when x = 'LVVDB11B0ND123456' then 'PASS' else 'FAIL' end) || ' B11 رقم الهيكل يظهر فقط بعد قرار المشاركة');
  select count(*) into n from public.ap_notifications where user_id = sa and kind = 'quote_request_invited';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B12 إعادة الإرسال لا تكرر إشعار المورد');

  -- ───────── عروض الموردين ─────────
  ok := false; begin perform public.ap_submit_supplier_quote(req, org_a, 'genuine', 100, 'SAR', 5, 10, 'CN', now() - interval '1 day'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C1 عرض بصلاحية منتهية مرفوض');
  sq := public.ap_submit_supplier_quote(req, org_a, 'genuine', 120, 'SAR', 5, 10, 'CN', now() + interval '7 days', 'مطابق للرقم');
  perform public.ap_submit_supplier_quote(req, org_a, 'genuine', 110, 'SAR', 5, 10, 'CN', now() + interval '7 days', 'تحديث');
  select count(*), max(unit_price) into n, num from public.ap_supplier_quotes where request_id = req;
  out := array_append(out, (case when n = 1 and num = 110 then 'PASS' else 'FAIL' end) || ' C2 عرض واحد لكل منشأة يُحدَّث ولا يتكرر');
  perform set_config('request.jwt.claims', json_build_object('sub', sb, 'role', 'authenticated')::text, true);
  perform public.ap_submit_supplier_quote(req, org_b, 'aftermarket', 60, 'CNY', null, 20, 'CN', now() + interval '7 days');
  select count(*) into n from public.ap_supplier_quotes where request_id = req;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C3 المورد لا يرى عروض المنافسين');
  ok := false; begin perform public.ap_submit_supplier_quote(req, org_a, 'genuine', 1, 'SAR', 5, 10, 'CN', now() + interval '7 days'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C4 لا يقدّم أحد عرضًا باسم منشأة أخرى');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_supplier_quotes where request_id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C5 العميل لا يرى عروض الموردين الداخلية');

  -- ───────── تسعيرة العميل ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_supplier_quotes where request_id = req;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' D1 الإدارة تقارن كل العروض');
  q1 := public.ap_admin_create_customer_quote(req, sq);
  select count(*), sum(amount) into n, num from public.ap_customer_quote_lines where quote_id = q1;
  out := array_append(out, (case when n = 1 and num = 220 then 'PASS' else 'FAIL' end) || ' D2 بند القطعة من عرض المورد × الكمية');
  ok := false; begin perform public.ap_admin_create_customer_quote(req, null); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D3 مسودة واحدة فقط في كل وقت');

  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_customer_quotes where request_id = req;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D4 العميل لا يرى المسودة');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);

  ok := false; begin perform public.ap_admin_set_quote_lines(q1, '[{"code":"service_fee","unit_amount":-5}]'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D5 مبلغ سالب لغير الخصم مرفوض');
  perform public.ap_admin_set_quote_lines(q1, '[
    {"code":"part","description":"فلتر هواء","quantity":2,"unit_amount":110,"status":"confirmed","source":"supplier_quote"},
    {"code":"international_shipping","unit_amount":45,"status":"estimated","beneficiary":"شركة الشحن"},
    {"code":"customs","unit_amount":12.5,"status":"estimated"},
    {"code":"service_fee","unit_amount":30},
    {"code":"discount","unit_amount":-10}]');
  ok := false; begin perform public.ap_admin_issue_customer_quote(q1, now() + interval '3 days', 14, '', 'المنصة'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D6 لا إصدار بلا شروط إلغاء');
  ok := false; begin perform public.ap_admin_issue_customer_quote(q1, now() - interval '1 day', 14, 'شروط', 'المنصة'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D7 لا إصدار بصلاحية ماضية');
  perform public.ap_admin_issue_customer_quote(q1, now() + interval '3 days', 14, 'يمكن الإلغاء قبل الشحن', 'المنصة (وسيط)');
  select total, has_estimated into num, b from public.ap_customer_quotes where id = q1;
  out := array_append(out, (case when num = 297.50 and b then 'PASS' else 'FAIL' end) || ' D8 القاعدة تحسب الإجمالي وتعلّم البنود التقديرية');
  ok := false; begin perform public.ap_admin_set_quote_lines(q1, '[{"code":"part","unit_amount":1}]'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D9 لا تعديل للبنود بعد الإصدار');
  select status::text into x from public.ap_supplier_quotes where id = sq;
  out := array_append(out, (case when x = 'selected' then 'PASS' else 'FAIL' end) || ' D10 عرض المورد المختار يصبح selected');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_withdraw_supplier_quote(sq); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D11 المورد لا يسحب عرضًا اختير');

  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_customer_quote_lines where quote_id = q1;
  out := array_append(out, (case when n = 5 then 'PASS' else 'FAIL' end) || ' D12 العميل يرى التفصيل الكامل بعد الإصدار');
  select count(*) into n from public.ap_notifications where user_id = cu and kind = 'customer_quote_issued';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D13 إشعار العميل بالتسعيرة');

  -- إصدار ثانٍ يلغي الأول
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  q2 := public.ap_admin_create_customer_quote(req, null);
  perform public.ap_admin_set_quote_lines(q2, '[{"code":"part","quantity":2,"unit_amount":105},{"code":"local_shipping","unit_amount":25}]');
  perform public.ap_admin_issue_customer_quote(q2, now() + interval '3 days', 10, 'يمكن الإلغاء قبل الشحن', 'المنصة (وسيط)');
  select status::text into x from public.ap_customer_quotes where id = q1;
  out := array_append(out, (case when x = 'superseded' then 'PASS' else 'FAIL' end) || ' E1 الإصدار الجديد يجعل السابق superseded');

  -- ───────── الموافقة وإنشاء الطلب ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_accept_customer_quote(q1); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E2 لا موافقة على إصدار قديم');
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_accept_customer_quote(q2); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E3 عميل آخر لا يوافق على التسعيرة');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ord := public.ap_accept_customer_quote(q2);
  select o.status::text || '/' || o.payment_status, o.total, o.accepted_snapshot into x, num, j from public.ap_orders o where o.id = ord;
  out := array_append(out, (case when x = 'awaiting_payment/unpaid' and num = 235 and jsonb_array_length(j->'lines') = 2 then 'PASS' else 'FAIL' end)
    || ' E4 الموافقة تنشئ طلبًا بانتظار الدفع مع snapshot');
  select count(*) into n from public.ap_order_items where order_id = ord;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' E5 بنود الطلب منسوخة من التسعيرة');
  ok := false; begin perform public.ap_accept_customer_quote(q2); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E6 لا موافقة مزدوجة ولا طلب مكرر');
  ok := false; begin update public.ap_orders set payment_status = 'paid' where id = ord; exception when others then ok := true; end;
  select payment_status into x from public.ap_orders where id = ord;
  out := array_append(out, (case when x = 'unpaid' then 'PASS' else 'FAIL' end) || ' E7 العميل لا يغيّر حالة الدفع');

  -- snapshot ثابت حتى لو عُدّلت البنود لاحقًا (مثلاً من لوحة Supabase)
  reset role;
  update public.ap_customer_quote_lines set unit_amount = 999 where quote_id = q2 and code = 'local_shipping';
  select (accepted_snapshot->>'total')::numeric into num from public.ap_orders where id = ord;
  out := array_append(out, (case when num = 235 then 'PASS' else 'FAIL' end) || ' E8 الـ snapshot لا يتغير بتعديل البنود');
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_orders where id = ord;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' E9 عميل آخر لا يرى الطلب');

  -- ───────── صلاحية منتهية ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  req2 := public.ap_create_quote_request(brand, null, null, null, null, null, 'مصباح أمامي', 1, 'جدة', 'عميل', '+966500000000', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  q1 := public.ap_admin_create_customer_quote(req2, null);
  perform public.ap_admin_set_quote_lines(q1, '[{"code":"part","unit_amount":300}]');
  perform public.ap_admin_issue_customer_quote(q1, now() + interval '2 hours', 10, 'شروط', 'المنصة');
  reset role; update public.ap_customer_quotes set valid_until = now() - interval '1 minute' where id = q1; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_accept_customer_quote(q1); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F1 لا موافقة على تسعيرة منتهية');
  perform public.ap_cancel_quote_request(req2);
  select status::text into x from public.ap_quote_requests where id = req2;
  out := array_append(out, (case when x = 'cancelled' then 'PASS' else 'FAIL' end) || ' F2 العميل يلغي طلبه المفتوح');

  reset role;
  select count(*) into n from public.ap_audit_logs where entity_type = 'ap_orders' and entity_id = ord::text;
  out := array_append(out, (case when n >= 1 then 'PASS' else 'FAIL' end) || ' F3 إنشاء الطلب مسجّل في التدقيق');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
