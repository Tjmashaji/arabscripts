-- أدوار قاعدة البيانات (تُنفّذ مرة واحدة بصلاحية superuser قبل الترحيلات).
-- trends_owner:  يملك الجداول وينفّذ الترحيلات.
-- trends_app:    صفحات التاجر والإدارة. يخضع لـ RLS ولا يرى رموز سلة أبدًا.
-- trends_worker: الويب هوك والمزامنة وحساب الترند. يتجاوز RLS لأنه يعمل على كل المتاجر.
\set ON_ERROR_STOP on
SELECT format('CREATE ROLE trends_owner LOGIN PASSWORD %L', :'owner_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_owner') \gexec
SELECT format('CREATE ROLE trends_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_app') \gexec
SELECT format('CREATE ROLE trends_worker LOGIN BYPASSRLS PASSWORD %L', :'worker_password')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_worker') \gexec
