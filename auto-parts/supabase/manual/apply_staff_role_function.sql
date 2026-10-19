-- انسخ هذا الملف كاملًا والصقه في Supabase ← مشروع 10:55 ← SQL Editor ← Run.
-- ينشئ دالة منح الأدوار الإدارية وسحبها (لا يحذف أي بيانات؛ كلمة delete داخل الدالة تُستخدم فقط عند سحب دور لاحقًا).
create or replace function public.ap_admin_set_staff_role(p_user_id uuid, p_role public.ap_staff_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('roles.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.ap_profiles where user_id = p_user_id) then
    raise exception 'ap: user has no profile' using errcode = 'P0002';
  end if;
  if p_grant then
    insert into public.ap_staff_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
      on conflict (user_id, role) do nothing;
  else
    if p_role = 'super_admin' and (select count(*) from public.ap_staff_roles where role = 'super_admin') <= 1 then
      raise exception 'ap: cannot remove the last super admin' using errcode = 'P0001';
    end if;
    delete from public.ap_staff_roles where user_id = p_user_id and role = p_role;
  end if;
end $$;
revoke all on function public.ap_admin_set_staff_role(uuid, public.ap_staff_role, boolean) from public, anon;
grant execute on function public.ap_admin_set_staff_role(uuid, public.ap_staff_role, boolean) to authenticated;
