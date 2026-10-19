-- المرحلة B1: الدعوات وطلبات الاعتماد والمستندات والمراجعة. يُلغى كل شيء في النهاية بخطأ RESULT مقصود.
-- مدير عمليات (ops)، متقدّم مدعو (a)، مستخدم آخر (b)، ومستخدم ثالث (c).
do $$
declare
  ops uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  tok text; tok2 text; tok3 text; inv uuid; app uuid; org uuid; doc uuid; path text; n int; ok boolean; x text; r record;
  out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ops, 'zz-p-ops@example.com', now()), (a, 'zz-p-a@example.com', now()), (b, 'zz-p-b@example.com', now()), (c, 'zz-p-c@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (ops, 'عمليات'), (a, 'متقدم'), (b, 'آخر'), (c, 'ثالث');
  insert into public.ap_staff_roles (user_id, role) values (ops, 'operations_admin');

  -- ───────── الدعوات ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_create_invitation('x@example.com', array['seller']::public.ap_capability[]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A1 المستخدم العادي لا ينشئ دعوة');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select i.id, i.token into inv, tok from public.ap_admin_create_invitation(' ZZ-P-A@example.com ', array['supplier', 'carrier']::public.ap_capability[], 'zh', 'مرحبًا') i;
  out := array_append(out, (case when tok ~ '^[0-9a-f]{64}$' then 'PASS' else 'FAIL' end) || ' A2 المدير ينشئ دعوة برمز عشوائي من 64 خانة');
  reset role;
  select count(*) into n from public.ap_invitations where id = inv and token_hash <> tok and token_hash = ap_private.token_hash(tok) and email = 'zz-p-a@example.com';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' A3 يُخزَّن بصمة الرمز لا الرمز نفسه، والبريد موحّد');

  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select * into r from public.ap_invitation_lookup(tok);
  out := array_append(out, (case when r.status = 'opened' and r.preferred_locale = 'zh' then 'PASS' else 'FAIL' end) || ' A4 الزائر يفتح الدعوة بالرمز وتُسجَّل «فُتحت»');
  select count(*) into n from public.ap_invitation_lookup(repeat('0', 64));
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' A5 رمز مخمَّن لا يعيد شيئًا');
  ok := false; begin select count(*) into n from public.ap_invitations; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' A6 الزائر لا يقرأ جدول الدعوات');
  reset role;

  -- ───────── قبول الدعوة ─────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_accept_invitation(tok, 'منشأة دخيلة', 'SA'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B1 لا يقبل الدعوة إلا صاحب البريد المدعو');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  app := public.ap_accept_invitation(tok, 'شركة التوريد', 'cn');
  select organization_id into org from public.ap_partner_applications where id = app;
  ok := false; begin perform public.ap_accept_invitation(tok, 'مرة ثانية', 'CN'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' B2 الدعوة لا تُستخدم مرتين');
  select count(*) into n from public.ap_organization_verifications where organization_id = org and status = 'requested';
  out := array_append(out, (case when n = 2 and not ap_private.org_can(org, 'supplier') then 'PASS' else 'FAIL' end)
    || ' B3 الصفات المدعو لها مطلوبة فقط، ولا تمنح صلاحية قبل الاعتماد');

  -- ───────── تعبئة الطلب والمستندات ─────────
  perform public.ap_save_application(app, jsonb_build_object(
    'legal_name', 'Shenzhen Parts Co.', 'country_code', 'CN', 'activity_description', 'توريد قطع شيري وجيلي',
    'contact_name', 'Li Wei', 'contact_phone', '+86 138 0000 0000', 'contact_email', 'LI@EXAMPLE.COM',
    'languages', jsonb_build_array('zh', 'en', 'xx'), 'declaration', true), array['supplier', 'carrier']::public.ap_capability[]);
  select contact_email || ':' || array_to_string(languages, ',') into x from public.ap_partner_applications where id = app;
  out := array_append(out, (case when x = 'li@example.com:zh,en' then 'PASS' else 'FAIL' end) || ' C1 حفظ الطلب وتجاهل اللغات غير المعروفة (' || x || ')');
  ok := false; begin perform public.ap_submit_application(app); exception when others then ok := sqlerrm like '%documents%'; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C2 لا يُرسل الطلب بلا مستندات');

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_partner_applications;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' C3 مستخدم آخر لا يرى طلب المنشأة');
  ok := false; begin perform public.ap_save_application(app, '{"legal_name":"اختراق"}', null); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C4 مستخدم آخر لا يعدّل الطلب');
  ok := false; begin insert into storage.objects (bucket_id, name) values ('ap-verification-docs', org || '/evil.pdf'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C5 مستخدم آخر لا يرفع ملفًا في مجلد المنشأة');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  path := org || '/' || gen_random_uuid() || '.pdf';
  insert into storage.objects (bucket_id, name, owner) values ('ap-verification-docs', path, a);
  ok := false; begin perform public.ap_add_document(app, 'commercial_register', gen_random_uuid() || '/x.pdf', 'x.pdf', 'application/pdf', 1000); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C6 لا يُسجَّل مستند خارج مجلد المنشأة');
  ok := false; begin perform public.ap_add_document(app, 'commercial_register', org || '/missing.pdf', 'm.pdf', 'application/pdf', 1000); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C7 لا يُسجَّل مستند لم يُرفع فعلًا');
  doc := public.ap_add_document(app, 'commercial_register', path, 'السجل.pdf', 'application/pdf', 120000, 'cn', null);
  perform public.ap_submit_application(app);
  select status::text into x from public.ap_partner_applications where id = app;
  out := array_append(out, (case when x = 'submitted_for_review' then 'PASS' else 'FAIL' end) || ' C8 يُرسل الطلب المكتمل للمراجعة');
  ok := false; begin perform public.ap_save_application(app, '{"legal_name":"تعديل بعد الإرسال"}', null); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C9 لا يُعدَّل الطلب بعد إرساله');
  ok := false; begin insert into storage.objects (bucket_id, name) values ('ap-verification-docs', org || '/late.pdf'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' C10 لا تُرفع ملفات بعد الإرسال');

  -- ───────── المراجعة ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_log_document_access(doc); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D1 مستخدم آخر لا يفتح مستند المنشأة');
  select count(*) into n from storage.objects where bucket_id = 'ap-verification-docs';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' D2 مستخدم آخر لا يرى ملفات التخزين الخاص');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  x := public.ap_log_document_access(doc);
  out := array_append(out, (case when x = path then 'PASS' else 'FAIL' end) || ' D3 المدير يفتح المستند ويُسجَّل الفتح');
  perform public.ap_admin_start_review(app);
  ok := false; begin perform public.ap_admin_review_application(app, 'changes_requested', '  '); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D4 طلب التعديل بلا سبب مرفوض');
  perform public.ap_admin_review_application(app, 'changes_requested', 'أرفق رخصة النقل', '{}', array['documents']);
  select status::text into x from public.ap_partner_applications where id = app;
  out := array_append(out, (case when x = 'changes_requested' then 'PASS' else 'FAIL' end) || ' D5 حالة الطلب «مطلوب تعديل»');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_notifications where kind = 'application_changes_requested';
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D6 المتقدّم يصله إشعار بطلب التعديل');
  select note into x from public.ap_application_change_requests where application_id = app and resolved_at is null;
  out := array_append(out, (case when x = 'أرفق رخصة النقل' then 'PASS' else 'FAIL' end) || ' D7 المتقدّم يرى ملاحظة التعديل');
  path := org || '/' || gen_random_uuid() || '.png';
  insert into storage.objects (bucket_id, name, owner) values ('ap-verification-docs', path, a);
  perform public.ap_add_document(app, 'transport_license', path, 'رخصة.png', 'image/png', 50000);
  perform public.ap_submit_application(app);
  select status::text into x from public.ap_partner_applications where id = app;
  select count(*) into n from public.ap_application_change_requests where application_id = app and resolved_at is null;
  out := array_append(out, (case when x = 'resubmitted' and n = 0 then 'PASS' else 'FAIL' end) || ' D8 إعادة الإرسال بعد التعديل');

  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_review_application(app, 'approved', null, '{}'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D9 الموافقة تتطلب صفة واحدة على الأقل');
  ok := false; begin perform public.ap_admin_review_application(app, 'approved', null, array['supplier']::public.ap_capability[]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D10 رفض صفة أخرى ضمن الموافقة يتطلب سببًا');
  ok := false; begin perform public.ap_admin_review_application(app, 'approved', null, array['seller']::public.ap_capability[]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D11 لا تُعتمد صفة لم يطلبها المتقدّم');
  perform public.ap_admin_review_application(app, 'approved', 'لا يوجد تأمين نقل', array['supplier']::public.ap_capability[]);
  reset role;
  out := array_append(out, (case when ap_private.org_can(org, 'supplier') and not ap_private.org_can(org, 'carrier') then 'PASS' else 'FAIL' end)
    || ' D12 اعتماد المورد ورفض الناقل للمنشأة نفسها');
  select count(*) into n from public.ap_application_reviews where application_id = app;
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' D13 سجل المراجعة محفوظ بكل القرارات (' || n || ')');
  select count(*) into n from public.ap_audit_logs where action = 'document_view' and actor_id = ops;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' D14 فتح المستند مسجل في سجل التدقيق');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_admin_review_application(app, 'rejected', 'متأخر'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D15 لا قرار جديد على طلب محسوم');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin delete from public.ap_application_reviews; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D16 لا أحد يحذف سجل المراجعة');
  ok := false; begin perform public.ap_admin_review_application(app, 'approved', null, array['carrier']::public.ap_capability[]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' D17 المتقدّم لا يعتمد طلبه');

  -- ───────── الإلغاء والانتهاء ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
  select i.id, i.token into inv, tok2 from public.ap_admin_create_invitation('zz-p-c@example.com', array['seller']::public.ap_capability[]) i;
  perform public.ap_admin_revoke_invitation(inv);
  select i.token into tok3 from public.ap_admin_create_invitation('zz-p-c@example.com', array['manufacturer']::public.ap_capability[], 'ar', null, 1) i;
  reset role;
  update public.ap_invitations set expires_at = now() - interval '1 minute' where token_hash = ap_private.token_hash(tok3);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_accept_invitation(tok2, 'منشأة', 'SA'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' E1 الدعوة الملغاة لا تُقبل');
  select status into x from public.ap_invitation_lookup(tok3);
  ok := false; begin perform public.ap_accept_invitation(tok3, 'منشأة', 'SA'); exception when others then ok := true; end;
  out := array_append(out, (case when ok and x = 'expired' then 'PASS' else 'FAIL' end) || ' E2 الدعوة المنتهية تظهر «انتهت» ولا تُقبل');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
