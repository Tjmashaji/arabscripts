-- المرحلة E — تشديد: Supabase يمنح anon وauthenticated صلاحية افتراضية على تسلسلات المخطط public.
-- كل الإدراج يتم عبر دوال النظام، فلا حاجة لأن يستهلك المتصفح أي تسلسل (حتى أرقام المعرّفات الداخلية).
do $$
declare r record;
begin
  for r in select c.oid::regclass as seq from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'ap\_%' loop
    execute format('revoke all on sequence %s from anon, authenticated', r.seq);
  end loop;
end $$;
