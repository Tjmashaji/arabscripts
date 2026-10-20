-- المرحلة B2: المنتجات والعروض والتوفر والبحث العام. يُلغى كل شيء في النهاية بخطأ RESULT مقصود.
-- مدير عمليات (ops)، بائع معتمد (sa) في المنشأة A، مورد معتمد (sb) في المنشأة B، ومستخدم منشأته غير معتمدة (sc).
do $$
declare
  ops uuid := gen_random_uuid(); sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid(); sc uuid := gen_random_uuid();
  org_a uuid; org_b uuid; org_c uuid; brand uuid; cat uuid; model uuid; prod uuid; offer_a uuid; offer_b uuid;
  n int; ok boolean; x text; b boolean; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ops, 'zz-c-ops@example.com', now()), (sa, 'zz-c-a@example.com', now()), (sb, 'zz-c-b@example.com', now()), (sc, 'zz-c-c@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (ops, 'عمليات'), (sa, 'بائع'), (sb, 'مورد'), (sc, 'غير معتمد');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin');
  insert into public.ap_organizations (legal_name, country_code, status) values ('منشأة A', 'SA', 'active') returning id into org_a;
  insert into public.ap_organizations (legal_name, country_code, status) values ('منشأة B', 'CN', 'active') returning id into org_b;
  insert into public.ap_organizations (legal_name, country_code, status) values ('منشأة C', 'CN', 'pending') returning id into org_c;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, sa, 'owner'), (org_b, sb, 'owner'), (org_c, sc, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values
    (org_a, 'seller', 'approved'), (org_b, 'supplier', 'approved'), (org_c, 'supplier', 'requested');
  select id into brand from public.ap_vehicle_brands where slug = 'chery';
  select id into cat from public.ap_categories where slug = 'filters';

  -- ───────── الكتالوج ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_upsert_model(null, brand, 'Tiggo 7', 'تيقو 7', 2020, 2024); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A1 البائع لا يضيف موديلات للكتالوج');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  model := public.ap_admin_upsert_model(null, brand, 'Tiggo 7', 'تيقو 7', 2020, 2024);
  out := array_append(out, (case when model is not null then 'PASS' else 'FAIL' end) || ' A2 الإدارة تضيف موديلًا');

  -- ───────── المنتج ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', sc, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_create_product(org_c, brand, cat, 'فلتر'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B1 منشأة غير معتمدة لا تضيف منتجًا');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_create_product(org_b, brand, cat, 'فلتر'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B2 لا يضيف أحد منتجًا باسم منشأة أخرى');
  prod := public.ap_create_product(org_a, brand, cat, 'فلتر زيت محرك', 'وصف', 'ar');
  ok := false; begin perform public.ap_submit_product(prod); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B3 لا يُرسل منتج للمراجعة بلا رقم قطعة');
  perform public.ap_set_product_identifiers(prod, '[{"kind":"oem","value":"ABC-123 45"},{"kind":"manufacturer","value":"MF/999"}]');
  perform public.ap_add_fitment(prod, model, 2021, 2023, '1.5T', null);
  perform public.ap_submit_product(prod);
  ok := false; begin perform public.ap_update_product(prod, brand, cat, 'تعديل أثناء المراجعة', null); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B4 لا يُعدَّل المنتج أثناء المراجعة');
  ok := false; begin perform public.ap_admin_review_product(prod, 'published'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B5 البائع لا ينشر منتجه بنفسه');

  perform set_config('request.jwt.claims', json_build_object('sub', sb, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_products where id = prod;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B6 منشأة أخرى لا ترى منتجًا غير منشور');
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_search_products('ABC12345');
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B7 الزائر لا يجد منتجًا غير منشور');
  reset role; set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_review_product(prod, 'rejected', ' '); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B8 رفض المنتج بلا سبب مرفوض');
  perform public.ap_admin_review_product(prod, 'published');
  reset role;

  -- ───────── البحث العام ─────────
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_search_products('abc 123-45');
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C1 البحث برقم القطعة يتجاهل المسافات والشرطات وحالة الأحرف');
  select count(*) into n from public.ap_search_products('فلتر زيت');
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C2 البحث باسم القطعة');
  select count(*) into n from public.ap_search_products(null, brand, model, 2022);
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C3 التصفية بالعلامة والموديل والسنة');
  select count(*) into n from public.ap_search_products(null, null, model, 2025);
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C4 سنة خارج نطاق التوافق لا تطابق');
  select count(*) into n from public.ap_search_products(null, null, null, null, null, null, true);
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C5 «المتوفر فقط» لا يعرض منتجًا بلا تأكيد توفر');
  ok := false; begin select count(*) into n from public.ap_product_offers; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C6 الزائر لا يقرأ جدول العروض مباشرة');
  reset role;

  -- ───────── العروض والتوفر ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_save_offer(null, prod, org_a, 'aftermarket', null, 'SAR', 'CN', 10, null, 'active'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D1 لا يُفعَّل عرض بلا سعر');
  offer_a := public.ap_save_offer(null, prod, org_a, 'aftermarket', 45.00, 'sar', 'cn', 10, null, 'active');
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*), bool_or(availability_fresh), max(stock_quantity) into n, b, x from public.ap_public_offers(prod);
  out := array_append(out, (case when n = 1 and not b and x is null then 'PASS' else 'FAIL' end)
    || ' D2 العرض يظهر «بانتظار التأكيد» والمخزون غير معروف (null) لا صفر');
  reset role; set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.ap_confirm_availability(offer_a, 'available', 5);
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select bool_or(availability_fresh) into b from public.ap_public_offers(prod);
  select count(*) into n from public.ap_search_products(null, null, null, null, null, null, true);
  out := array_append(out, (case when b and n = 1 then 'PASS' else 'FAIL' end) || ' D3 تأكيد التوفر يجعل العرض «متوفر» حديثًا');
  select min_price_sar::text into x from public.ap_search_products('ABC');
  out := array_append(out, (case when x = '45.00' then 'PASS' else 'FAIL' end) || ' D4 أقل سعر بالريال يظهر في نتائج البحث');
  reset role;
  update public.ap_product_offers set last_confirmed_at = now() - interval '49 hours' where id = offer_a;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select bool_or(availability_fresh), max(stock_quantity) into b, n from public.ap_public_offers(prod);
  out := array_append(out, (case when not b and n is null then 'PASS' else 'FAIL' end) || ' D5 التأكيد الأقدم من 48 ساعة لا يُعتبر حديثًا ولا تُعرض كميته');
  reset role; set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.ap_confirm_availability(offer_a, 'available', 5);
  perform public.ap_save_offer(offer_a, prod, org_a, 'aftermarket', 50.00, 'SAR', 'CN', 10, null, 'active');
  select (last_confirmed_at is null and availability_status = 'pending_confirmation') into b from public.ap_product_offers where id = offer_a;
  out := array_append(out, (case when b then 'PASS' else 'FAIL' end) || ' D6 تغيير السعر يُسقط تأكيد التوفر السابق');

  -- منشأة ثانية تعرض القطعة نفسها
  perform set_config('request.jwt.claims', json_build_object('sub', sb, 'role', 'authenticated')::text, true);
  offer_b := public.ap_save_offer(null, prod, org_b, 'genuine', 80.00, 'SAR', 'CN', 20, null, 'active');
  select count(*) into n from public.ap_product_offers;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' E1 المورد لا يرى عروض منافسه الداخلية (' || n || ')');
  ok := false; begin perform public.ap_save_offer(offer_a, prod, org_b, 'aftermarket', 1.00, 'SAR', 'CN', 1, null, 'active'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E2 المورد لا يعدّل عرض منافسه');
  ok := false; begin perform public.ap_confirm_availability(offer_a, 'out_of_stock'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E3 المورد لا يؤكد توفر عرض منافسه');
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_public_offers(prod);
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' E4 عروض متعددة للقطعة نفسها تظهر للزائر');
  reset role; set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_confirm_availability(offer_b, 'on_request');
  reset role;
  select source into x from public.ap_inventory_snapshots where offer_id = offer_b order by confirmed_at desc limit 1;
  out := array_append(out, (case when x = 'admin' then 'PASS' else 'FAIL' end) || ' E5 تأكيد الإدارة مسجل بمصدره');
  select count(*) into n from public.ap_inventory_snapshots where offer_id = offer_a;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' E6 تاريخ التأكيدات محفوظ');

  -- إيقاف الصفة أو انتهاء العرض يخفيه
  update public.ap_organization_verifications set status = 'suspended' where organization_id = org_b;
  update public.ap_product_offers set valid_until = now() - interval '1 minute' where id = offer_a;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_public_offers(prod);
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' F1 العرض المنتهي وعرض المنشأة الموقوفة لا يظهران');
  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sb, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_save_offer(offer_b, prod, org_b, 'genuine', 70.00, 'SAR', 'CN', 20, null, 'active'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F2 المنشأة الموقوفة لا تعدّل عروضها');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_review_product(prod, 'suspended', 'بلاغ عن عدم مطابقة');
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_products where id = prod;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' F3 المنتج الموقوف يختفي من العرض العام');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
