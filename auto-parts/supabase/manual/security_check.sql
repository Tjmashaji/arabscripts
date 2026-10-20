-- فحص أمان للمشروع الحقيقي: الصقه في SQL Editor ثم Run. لا يغيّر شيئًا (قراءة فقط).
-- النتيجة المطلوبة: «No rows returned». أي صف يظهر = مخالفة يجب إصلاحها قبل الإطلاق.
-- نفس فحوص supabase/tests/security.sql.
with allowed_updates(col) as (values
  ('ap_profiles.full_name'), ('ap_profiles.phone'), ('ap_user_preferences.locale'), ('ap_user_preferences.timezone'),
  ('ap_notifications.read_at'), ('ap_organizations.trade_name'), ('ap_organizations.entity_type'),
  ('ap_organizations.registered_address'), ('ap_organizations.operating_country'), ('ap_organizations.website'),
  ('ap_organizations.activity_description'), ('ap_organizations.billing_currency'), ('ap_organizations.preferred_locale')
), allowed_anon(fn) as (values ('ap_search_products'), ('ap_public_offers'), ('ap_invitation_lookup'))
select 'S1 RLS غير مفعّل' as check, c.relname::text as object
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ap\_%' and not c.relrowsecurity
union all
select 'S2 صلاحية كتابة على جدول', grantee || ':' || table_name || ':' || privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'ap\_%' and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
union all
select 'S3 تعديل عمود غير مسموح', grantee || ':' || table_name || '.' || column_name
  from information_schema.column_privileges
  where table_schema = 'public' and table_name like 'ap\_%' and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'
    and (grantee <> 'authenticated' or privilege_type <> 'UPDATE' or (table_name || '.' || column_name) not in (select col from allowed_updates))
union all
select 'S4 دالة SECURITY DEFINER بلا search_path', n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ap_private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
select 'S5 دالة متاحة للزائر', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'ap\_%' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname::text not in (select fn from allowed_anon)
union all
select 'S6 مستودع ملفات عام', id from storage.buckets where id like 'ap-%' and public and id <> 'ap-product-media'
union all
select 'S7 تسلسل متاح للمتصفح', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'ap\_%'
    and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))
union all
select 'S9 جدول خاص يقرؤه الزائر', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ap\_%' and has_table_privilege('anon', c.oid, 'select')
    and c.relname not in ('ap_locales', 'ap_platform_settings', 'ap_vehicle_brands', 'ap_vehicle_models', 'ap_categories',
                          'ap_products', 'ap_product_identifiers', 'ap_vehicle_fitments', 'ap_product_media')
order by 1, 2;
