-- دوال الإدارة والبحث لا تُستدعى دون تسجيل دخول (تتحقق من الصلاحية داخليًا أيضًا).
revoke execute on function public.activate_school(uuid, text), public.admin_add_school(text, text, text, text, double precision, double precision, text, boolean),
  public.admin_import_schools(jsonb, text), public.admin_review_claim(uuid, text, text), public.admin_school_directory(text, text),
  public.search_schools(text, integer), public.push_internal_config(), public.push_store_keys(text, text) from anon, public;
