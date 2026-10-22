-- الإشعارات الفورية: تسجيل الأجهزة، وإرسال الإشعار لأجهزة صاحبه فقط، وحماية مسار الإبلاغ عن الرموز المنتهية.
do $$
declare
  cu uuid := gen_random_uuid(); cx uuid := gen_random_uuid();
  tok text := 'fcm-token-' || repeat('a', 40); tok2 text := 'apns-token-' || repeat('b', 40);
  n int; ok boolean; j jsonb; out text[] := '{}';
begin
  -- يبدأ بلا إعداد حتى لو طُبّق ملف الإعداد اليدوي (الاختبار يُلغى كاملًا في نهايته).
  update public.ap_platform_settings set value = '""' where key = 'push_webhook_url';
  delete from vault.secrets where name = 'ap_push_webhook_secret';
  insert into auth.users (id, email, email_confirmed_at) values (cu, 'zz-p-cu@example.com', now()), (cx, 'zz-p-cx@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (cu, 'عميل'), (cx, 'عميل آخر');
  insert into public.ap_user_preferences (user_id, locale) values (cu, 'en'), (cx, 'ar') on conflict (user_id) do update set locale = excluded.locale;

  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_register_push_token(tok, 'android'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' P1 الزائر لا يسجّل جهازًا');

  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  perform public.ap_register_push_token(tok, 'android');
  select count(*) into n from public.ap_push_tokens;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' P2 المستخدم يسجّل جهازه ويراه');
  ok := false; begin perform public.ap_register_push_token(tok2, 'windows'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' P3 منصة غير معروفة مرفوضة');
  ok := false; begin insert into public.ap_push_tokens (token, user_id, platform) values (tok2, cx, 'ios'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' P4 لا إدراج مباشر (لا تسجيل جهاز باسم غيرك)');
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  select count(*) into n from public.ap_push_tokens;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' P5 لا يرى أجهزة غيره');
  perform public.ap_unregister_push_token(tok);
  reset role; select count(*) into n from public.ap_push_tokens where token = tok;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' P6 لا يلغي تسجيل جهاز غيره');

  -- بلا إعداد: لا يُرسل شيء
  perform ap_private.notify(cu, 'order_status', '{"reference":"ORD-1","status":"paid"}');
  select count(*) into n from net.test_requests;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' P7 بلا رابط وسر لا يُرسل شيء');

  update public.ap_platform_settings set value = '"https://platform.example/api/push/dispatch"' where key = 'push_webhook_url';
  perform vault.create_secret('test-secret-value', 'ap_push_webhook_secret');
  perform ap_private.notify(cu, 'customer_quote_issued', '{"request_id":"r1","reference":"RFQ-1"}');
  select body into j from net.test_requests where url = 'https://platform.example/api/push/dispatch' and headers->>'x-push-secret' = 'test-secret-value'
    order by id desc limit 1;
  out := array_append(out, (case when j->>'kind' = 'customer_quote_issued' and j->>'locale' = 'en' and j->'tokens'->0->>'token' = tok
    and j->'tokens'->0->>'platform' = 'android' and j->'payload'->>'reference' = 'RFQ-1' then 'PASS' else 'FAIL' end)
    || ' P8 الإشعار يُرسل لأجهزة صاحبه بلغته ومعه السر');
  out := array_append(out, (case when j->>'email' = 'zz-p-cu@example.com' then 'PASS' else 'FAIL' end) || ' P8b ومعه بريد صاحبه المؤكد');
  perform ap_private.notify(cx, 'order_status', '{"reference":"ORD-2","status":"paid"}');
  select body into j from net.test_requests order by id desc limit 1;
  out := array_append(out, (case when j->>'email' = 'zz-p-cx@example.com' and j->'tokens' = '[]'::jsonb then 'PASS' else 'FAIL' end)
    || ' P9 من لا جهاز له يصله الإشعار بالبريد');
  update auth.users set email_confirmed_at = null where id = cx;
  select count(*) into n from net.test_requests;
  perform ap_private.notify(cx, 'order_status', '{"reference":"ORD-2","status":"shipped"}');
  select count(*) - n into n from net.test_requests;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' P9b لا جهاز ولا بريد مؤكد: لا يُرسل شيء');
  update auth.users set email_confirmed_at = now() where id = cx;
  update public.ap_platform_settings set value = '"http://insecure.example/push"' where key = 'push_webhook_url';
  select count(*) into n from net.test_requests;
  perform ap_private.notify(cu, 'order_status', '{"reference":"ORD-1","status":"shipped"}');
  select count(*) - n into n from net.test_requests;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' P10 لا إرسال لرابط غير مشفّر');

  -- الإبلاغ عن الرموز المنتهية
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; begin perform public.ap_push_tokens_invalid('wrong', array[tok]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' P11 حذف الرموز يرفض السر الخاطئ');
  ok := false; begin perform public.ap_push_tokens_invalid(null, array[tok]); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' P12 ويرفض السر الفارغ');
  n := public.ap_push_tokens_invalid('test-secret-value', array[tok]);
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' P13 بالسر الصحيح تُحذف الرموز المنتهية');

  -- نقل الجهاز لحساب آخر، وحد الأجهزة
  reset role; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  perform public.ap_register_push_token(tok2, 'ios');
  perform set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true);
  perform public.ap_register_push_token(tok2, 'ios');
  reset role; select count(*) into n from public.ap_push_tokens where token = tok2 and user_id = cx;
  out := array_append(out, (case when n = 1 then 'PASS' else 'FAIL' end) || ' P14 الدخول بحساب آخر على نفس الجهاز ينقل الإشعارات له');
  set local role authenticated;
  for i in 1..12 loop perform public.ap_register_push_token('device-' || lpad(i::text, 30, '0'), 'android'); end loop;
  reset role; select count(*) into n from public.ap_push_tokens where user_id = cx;
  out := array_append(out, (case when n = 10 then 'PASS' else 'FAIL' end) || ' P15 أحدث 10 أجهزة فقط لكل مستخدم');

  -- حذف الحساب يحذف أجهزته
  delete from auth.users where id = cx;
  select count(*) into n from public.ap_push_tokens where user_id = cx;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' P16 حذف الحساب يحذف أجهزته');

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
