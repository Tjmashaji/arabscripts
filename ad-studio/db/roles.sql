-- أدوار قاعدة البيانات (تُنفّذ مرة واحدة بصلاحية superuser قبل الترحيلات).
-- studio_owner: يملك الجداول وينفّذ الترحيلات.
-- studio_app:   يستخدمه تطبيق الويب. يخضع لسياسات RLS ولا يستطيع تجاوزها.
-- studio_worker: يستخدمه العامل الخلفي. يتجاوز RLS لأنه ينفّذ مهام كل المساحات.
-- غيّر كلمات المرور في الإنتاج عبر psql -v (انظر README).
\set ON_ERROR_STOP on
SELECT format('CREATE ROLE studio_owner LOGIN PASSWORD %L', :'owner_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_owner') \gexec
SELECT format('CREATE ROLE studio_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_app') \gexec
SELECT format('CREATE ROLE studio_worker LOGIN BYPASSRLS PASSWORD %L', :'worker_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_worker') \gexec
