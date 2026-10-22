-- المرحلة E: فحوص أمان على مستوى الكتالوج (تشمل كل الجداول والدوال الحالية والقادمة تلقائيًا).
-- أي جدول جديد بلا RLS، أو صلاحية كتابة مباشرة غير مقصودة، أو دالة SECURITY DEFINER بلا search_path،
-- أو دالة جديدة متاحة للزائر، أو مستودع ملفات عام جديد: يفشل الاختبار.
-- نفس الفحوص تُشغَّل على المشروع الحقيقي عبر supabase/manual/security_check.sql.
do $$
declare
  out text[] := '{}'; bad text[];
  -- أعمدة يحدّثها المستخدم مباشرة (محمية بسياسات RLS ومشغّل guard_org_update للمنشأة).
  allowed_updates text[] := array[
    'ap_profiles.full_name', 'ap_profiles.phone', 'ap_user_preferences.locale', 'ap_user_preferences.timezone',
    'ap_notifications.read_at', 'ap_organizations.trade_name', 'ap_organizations.entity_type',
    'ap_organizations.registered_address', 'ap_organizations.operating_country', 'ap_organizations.website',
    'ap_organizations.activity_description', 'ap_organizations.billing_currency', 'ap_organizations.preferred_locale'];
  -- الدوال الوحيدة المتاحة للزائر: البحث والعروض العامة وفحص رابط الدعوة.
  -- ap_push_tokens_invalid يستدعيه مسار الإشعارات بلا جلسة، ومحمي بسر مشترك.
  allowed_anon text[] := array['ap_search_products', 'ap_public_offers', 'ap_invitation_lookup', 'ap_track_order', 'ap_push_tokens_invalid'];
begin
  select array_agg(c.relname order by c.relname) into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ap\_%' and not c.relrowsecurity;
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S1 RLS مفعّل على كل جداول المنصة' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(distinct grantee || ':' || table_name || ':' || privilege_type) into bad from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'ap\_%' and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S2 لا إدراج ولا حذف ولا تعديل كامل من المتصفح' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(distinct grantee || ':' || table_name || '.' || column_name) into bad from information_schema.column_privileges
    where table_schema = 'public' and table_name like 'ap\_%' and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'
      and (grantee <> 'authenticated' or privilege_type <> 'UPDATE' or not (table_name || '.' || column_name) = any (allowed_updates));
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S3 التعديل المباشر محصور في أعمدة معروفة' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(n.nspname || '.' || p.proname) into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'ap_private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S4 كل دالة SECURITY DEFINER لها search_path ثابت' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(distinct p.proname) into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'ap\_%' and has_function_privilege('anon', p.oid, 'execute')
      and not p.proname = any (allowed_anon);
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S5 الزائر لا ينفّذ إلا البحث والعروض العامة وفحص الدعوة وتتبع الطلب' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(id) into bad from storage.buckets where id like 'ap-%' and public and id <> 'ap-product-media';
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S6 كل مستودعات الملفات خاصة عدا صور المنتجات' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(c.relname) into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'ap\_%'
      and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'));
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S7 أرقام المراجع لا تُستهلك من المتصفح' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(distinct table_name) into bad from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('ap_audit_logs', 'ap_payments', 'ap_order_status_history', 'ap_application_reviews')
      and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT';
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S8 السجلات التاريخية (التدقيق، الدفع، الحالات، المراجعات) للقراءة فقط' || coalesce(': ' || array_to_string(bad, ', '), ''));

  select array_agg(c.relname) into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ap\_%'
      and has_table_privilege('anon', c.oid, 'select')
      and c.relname not in ('ap_locales', 'ap_platform_settings', 'ap_vehicle_brands', 'ap_vehicle_models', 'ap_categories',
                            'ap_products', 'ap_product_identifiers', 'ap_vehicle_fitments', 'ap_product_media');
  out := array_append(out, (case when bad is null then 'PASS' else 'FAIL' end) || ' S9 الزائر يقرأ جداول الكتالوج العامة فقط' || coalesce(': ' || array_to_string(bad, ', '), ''));

  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;
