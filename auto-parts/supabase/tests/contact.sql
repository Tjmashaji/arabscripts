-- المرحلة F: مساعد التأكيد الآلي — الموافقة، إنشاء مهام الاتصال، الرمز السري للعامل، ساعات الاتصال، النتائج، الصلاحيات.
-- عميل موافق (cu)، عميل غير موافق (cn)، عمليات (ops)، دعم (sup)، مورد (sa).
do $$
declare
  cu uuid := gen_random_uuid(); cn uuid := gen_random_uuid(); ops uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); tok text := repeat('t', 40);
  org_a uuid; brand uuid; req uuid; req_n uuid; sq uuid; sq_n uuid; cq uuid; cq_n uuid; ord uuid; job uuid;
  n int; ok boolean; x text; j jsonb; out text[] := '{}';
begin
  -- بديل net.http_post يسجّل التنبيهات بدل إرسالها.
  create temp table kicks (url text, headers jsonb) on commit drop;
  grant all on kicks to public;
  create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $f$ begin insert into kicks values (url, headers); return 0; end $f$;
  update ap_private.contact_settings set enabled = true, dispatch_url = 'https://shop.example.com/api/contact/dispatch',
    worker_token = tok, call_hour_from = 0, call_hour_to = 24, max_attempts = 2;

  insert into auth.users (id, email, email_confirmed_at) values
    (cu, 'zz-c-cu@example.com', now()), (cn, 'zz-c-cn@example.com', now()), (ops, 'zz-c-ops@example.com', now()),
    (sup, 'zz-c-sup@example.com', now()), (sa, 'zz-c-a@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (cu, 'عميل'), (cn, 'عميل آخر'), (ops, 'عمليات'), (sup, 'دعم'), (sa, 'مورد');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin'), (sup, 'support_agent');
  insert into public.ap_organizations (legal_name, country_code, status) values ('مورد', 'CN', 'active') returning id into org_a;
  insert into public.ap_organization_members (organization_id, user_id, member_role) values (org_a, sa, 'owner');
  insert into public.ap_organization_verifications (organization_id, capability, status) values (org_a, 'supplier', 'approved');
  select id into brand from public.ap_vehicle_brands where slug = 'chery';
  set local role authenticated;

  -- ───────── الموافقة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  req := public.ap_create_quote_request(brand, null, 2023, null, null, 'F-1', 'فلتر زيت', 2, 'الرياض', 'عميل', '+966500000010', true,
    null, null, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  req_n := public.ap_create_quote_request(brand, null, 2023, null, null, null, 'مساحات', 1, 'جدة', 'عميل آخر', '+966500000011', true);
  reset role;
  select count(*) into n from public.ap_quote_requests where (id = req and auto_contact_consent_at is not null)
    or (id = req_n and auto_contact_consent_at is null);
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' A1 الموافقة تُحفظ عند طلبها فقط، والاستدعاء القديم بلا موافقة');
  set local role authenticated;

  -- ───────── صدور التسعيرة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_send_request_to_suppliers(req, array[org_a], false);
  perform public.ap_admin_send_request_to_suppliers(req_n, array[org_a], false);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  sq := public.ap_submit_supplier_quote(req, org_a, 'genuine', 50, 'SAR', 5, 7, 'CN', now() + interval '10 days');
  sq_n := public.ap_submit_supplier_quote(req_n, org_a, 'genuine', 30, 'SAR', 5, 7, 'CN', now() + interval '10 days');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  cq := public.ap_admin_create_customer_quote(req, sq);
  cq_n := public.ap_admin_create_customer_quote(req_n, sq_n);
  perform public.ap_admin_issue_customer_quote(cq, now() + interval '3 days', 10, 'لا إلغاء بعد الشحن', 'المنصة');
  perform public.ap_admin_issue_customer_quote(cq_n, now() + interval '3 days', 10, 'لا إلغاء بعد الشحن', 'المنصة');
  select count(*) into n from public.ap_contact_jobs where customer_quote_id = cq and kind = 'quote_ready' and status = 'queued';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B1 صدور التسعيرة ينشئ مهمة اتصال للعميل الموافق');
  select count(*) into n from public.ap_contact_jobs where request_id = req_n;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' B2 لا اتصال بعميل لم يوافق');
  select count(*) into n from kicks where url like 'https://shop.example.com/%' and headers->>'Authorization' = 'Bearer ' || tok;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' B3 القاعدة تنبّه الخادم بالرمز السري مرة واحدة');

  -- ───────── القراءة ─────────
  select count(*) into n from public.ap_contact_jobs;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' C1 العمليات ترى مهام الاتصال');
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_contact_jobs;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C2 العميل لا يرى ملخصات المكالمات');
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_contact_jobs;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C3 الدعم لا يرى مهام الاتصال');

  -- ───────── العامل ─────────
  reset role; set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_contact_claim('wrong-token-wrong-token-wrong-token'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D1 رمز خاطئ مرفوض');
  ok := false; begin perform public.ap_contact_report('wrong', null, 'answered', 'confirmed', null, 'x'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D2 لا يُسجَّل تقرير برمز خاطئ');
  j := public.ap_contact_claim(tok);
  job := (j->0->>'id')::uuid;
  out := array_append(out, (case when jsonb_array_length(j) = 1 and j->0->>'phone' = '+966500000010' and j->0->>'kind' = 'quote_ready'
    and (j->0->>'total')::numeric = 100 and j->0->>'vehicle' like '%2023%' then 'PASS' else 'FAIL' end) || ' D3 الاستلام يعيد بيانات المكالمة');
  j := public.ap_contact_claim(tok);
  out := array_append(out, (case when jsonb_array_length(j) = 0 then 'PASS' else 'FAIL' end) || ' D4 لا تُستلم المهمة مرتين');
  perform public.ap_contact_report(tok, job, 'started', null, null, 'call-1');
  j := public.ap_contact_report(tok, null, 'no_answer', null, null, 'call-1', 'customer-did-not-answer');
  out := array_append(out, (case when j->>'action' = 'whatsapp' and j->'job'->>'phone' = '+966500000010' and j->'job'->>'name' = 'عميل' then 'PASS' else 'FAIL' end) || ' D5 عدم الرد يطلب رسالة واتساب ببيانات العميل (بمعرّف المكالمة)');
  j := public.ap_contact_report(tok, null, 'no_answer', null, null, 'call-1');
  out := array_append(out, (case when j->>'action' = 'ok' then 'PASS' else 'FAIL' end) || ' D6 تقرير مكرر لا يرسل واتساب مرة ثانية');
  perform public.ap_contact_report(tok, job, 'whatsapp_sent');
  reset role;
  select status::text into x from public.ap_contact_jobs where id = job;
  out := array_append(out, (case when x = 'whatsapp_sent' then 'PASS' else 'FAIL' end) || ' D7 الحالة: أُرسل واتساب');

  -- ───────── موافقة العميل وإنشاء الطلب ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_requeue_contact(job);
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  ord := public.ap_accept_customer_quote(cq);
  reset role;
  select status::text into x from public.ap_contact_jobs where id = job;
  select count(*) into n from public.ap_contact_jobs where order_id = ord and kind = 'order_confirm' and status = 'queued';
  out := array_append(out, (case when x = 'cancelled' and n = 1 then 'PASS' else 'FAIL' end)
    || ' E1 الطلب ينشئ مكالمة تأكيد ويلغي مكالمة التسعيرة المعلّقة');
  set local role anon;
  j := public.ap_contact_claim(tok);
  job := (j->0->>'id')::uuid;
  out := array_append(out, (case when j->0->>'kind' = 'order_confirm' and j->0->>'reference' like 'ORD-%' then 'PASS' else 'FAIL' end)
    || ' E2 مكالمة الطلب تحمل رقم ORD');
  perform public.ap_contact_report(tok, job, 'failed', null, null, null, 'twilio-failed-to-connect-call');
  j := public.ap_contact_claim(tok);
  reset role;
  select status::text || ':' || attempts into x from public.ap_contact_jobs where id = job;
  out := array_append(out, (case when x = 'queued:1' and jsonb_array_length(j) = 0 then 'PASS' else 'FAIL' end)
    || ' E3 الفشل يعيد الجدولة بعد 30 دقيقة لا فورًا');
  update public.ap_contact_jobs set next_attempt_at = now() where id = job;
  set local role anon;
  perform public.ap_contact_claim(tok);
  perform public.ap_contact_report(tok, job, 'failed', null, null, null, 'boom');
  reset role;
  select status::text || ':' || attempts into x from public.ap_contact_jobs where id = job;
  out := array_append(out, (case when x = 'failed:2' then 'PASS' else 'FAIL' end) || ' E4 بعد أقصى عدد محاولات تبقى فاشلة');

  -- ───────── إعادة الاتصال يدويًا والنتيجة ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_requeue_contact(job); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' F1 الدعم لا يعيد الاتصال');
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  perform public.ap_admin_requeue_contact(job);
  reset role; set local role anon;
  perform public.ap_contact_claim(tok);
  perform public.ap_contact_report(tok, job, 'started', null, null, 'call-2');
  -- تقرير نهاية المكالمة قد يصل قبل نتيجة الأداة: النتيجة الواضحة تستبدل «غير واضح».
  perform public.ap_contact_report(tok, null, 'answered', 'unclear', 'ملخص عام', 'call-2');
  perform public.ap_contact_report(tok, null, 'answered', 'confirmed', 'العميل أكد الطلب وسيدفع بالتحويل', 'call-2');
  perform public.ap_contact_report(tok, null, 'answered', 'unclear', 'تقرير متأخر', 'call-2');
  reset role;
  select status::text || ':' || outcome::text || ':' || summary into x from public.ap_contact_jobs where id = job;
  select status::text into j from (select to_jsonb(status) as status from public.ap_orders where id = ord) t;
  out := array_append(out, (case when x = 'answered:confirmed:العميل أكد الطلب وسيدفع بالتحويل' and j = '"awaiting_payment"'::jsonb then 'PASS' else 'FAIL' end)
    || ' F2 النتيجة تُسجَّل والطلب لا يتغير تلقائيًا');

  -- ───────── ساعات الاتصال والإيقاف ─────────
  update public.ap_contact_jobs set status = 'queued', next_attempt_at = now() where id = job;
  n := extract(hour from now() at time zone 'Asia/Riyadh')::int;
  update ap_private.contact_settings set call_hour_from = (n + 1) % 24, call_hour_to = (n + 1) % 24 + 1;
  set local role anon;
  j := public.ap_contact_claim(tok);
  reset role;
  out := array_append(out, (case when jsonb_array_length(j) = 0 then 'PASS' else 'FAIL' end) || ' G1 لا مكالمات خارج ساعات الاتصال (توقيت الرياض)');
  update ap_private.contact_settings set call_hour_from = 0, call_hour_to = 24, enabled = false;
  set local role anon;
  j := public.ap_contact_claim(tok);
  reset role;
  out := array_append(out, (case when jsonb_array_length(j) = 0 then 'PASS' else 'FAIL' end) || ' G2 الإيقاف من الإعدادات يمنع المكالمات');
  delete from kicks;
  perform ap_private.contact_sweep();
  select count(*) into n from kicks;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' G3 لا تنبيه للخادم والميزة موقفة');
  update ap_private.contact_settings set enabled = true;
  perform ap_private.contact_sweep();
  select count(*) into n from kicks;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' G4 المسح الدوري ينبّه الخادم حين توجد مهام مستحقة');
  select count(*) into n from cron.job where jobname = 'ap-contact-sweep';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' G5 المسح مجدول كل 10 دقائق');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
