-- حصة مساعد التعبئة الذكي.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); ok boolean; n int; i int; out text[] := '{}';
begin
  insert into auth.users (id, email, email_confirmed_at) values (u1, 'zz-ai-1@example.com', now()), (u2, 'zz-ai-2@example.com', now());
  insert into public.ap_profiles (user_id, full_name) values (u1, 'أ'), (u2, 'ب');
  update public.ap_platform_settings set value = '3' where key = 'ai_daily_user_limit';
  update public.ap_platform_settings set value = '5' where key = 'ai_daily_total_limit';

  set local role anon;
  ok := false; begin perform public.ap_ai_quota_take('product'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' AI1 الزائر بلا حساب لا يستخدم المساعد');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.ap_ai_quota_take('Bad Kind!'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' AI2 نوع غير صالح مرفوض');
  n := 0;
  for i in 1..4 loop if public.ap_ai_quota_take('product') then n := n + 1; end if; end loop;
  out := array_append(out, (case when n = 3 then 'PASS' else 'FAIL' end) || ' AI3 حصة المستخدم اليومية (' || n || '/4)');
  ok := false; begin perform count(*) from public.ap_ai_usage; exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' AI4 المستخدم لا يقرأ سجل الاستخدام');

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  n := 0;
  for i in 1..3 loop if public.ap_ai_quota_take('partner_application') then n := n + 1; end if; end loop;
  out := array_append(out, (case when n = 2 then 'PASS' else 'FAIL' end) || ' AI5 سقف المنصة اليومي يوقف الجميع (' || n || '/3)');
  reset role;

  update public.ap_ai_usage set created_at = now() - interval '25 hours' where user_id = u1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := public.ap_ai_quota_take('product');
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' AI6 الحصة تتجدد بعد 24 ساعة');
  reset role;

  update public.ap_profiles set status = 'suspended' where user_id = u1;
  set local role authenticated;
  ok := false; begin perform public.ap_ai_quota_take('product'); exception when others then ok := true; end;
  out := array_append(out, (case when ok then 'PASS' else 'FAIL' end) || ' AI7 الحساب الموقوف لا يستخدم المساعد');
  reset role;

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
