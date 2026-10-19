-- مشروع Supabase المشترك يسمح بالدخول المجهول (anonymous sign-ins)، وجلسته تحمل دور authenticated.
-- لا ملف شخصي لجلسة مجهولة، وبالتالي لا منشأة ولا صلاحيات (كل الفحوص تمر عبر ap_private.is_active_user).
create or replace function public.ap_ensure_profile(p_full_name text default null, p_locale text default null)
returns public.ap_profiles language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); prof public.ap_profiles; loc text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'ap: not authenticated' using errcode = '42501';
  end if;
  select * into prof from public.ap_profiles where user_id = uid;
  if found then return prof; end if;
  loc := coalesce((select code from public.ap_locales where code = p_locale and enabled), 'ar');
  insert into public.ap_profiles (user_id, full_name)
    values (uid, left(coalesce(nullif(btrim(p_full_name), ''), ''), 120)) returning * into prof;
  insert into public.ap_user_preferences (user_id, locale) values (uid, loc);
  return prof;
end $$;
revoke all on function public.ap_ensure_profile(text, text) from public, anon;
grant execute on function public.ap_ensure_profile(text, text) to authenticated;
