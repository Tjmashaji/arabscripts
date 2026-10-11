-- المرحلة ١ (تكملة): منح الأدوار بمنطقة، وحذف أي سجل لمدير النظام.
-- منفصلة لأنها تحذف دالة قديمة وتحتوي عمليات حذف.

drop function if exists public.admin_set_platform_role(uuid, text, boolean);
create or replace function public.admin_set_platform_role(p_user uuid, p_role text, p_grant boolean, p_region text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  if p_role not in ('super_admin','executive') then raise exception 'INVALID_ROLE' using errcode = 'P0001'; end if;
  if p_grant then
    if p_role = 'executive' and coalesce(btrim(p_region), '') = '' then raise exception 'REGION_REQUIRED' using errcode = 'P0001'; end if;
    insert into public.user_roles(user_id, role, region, created_by)
      values (p_user, p_role, case when p_role = 'executive' then btrim(p_region) end, (select auth.uid()))
      on conflict (user_id, role) do update set region = excluded.region;
    update public.profiles set status = 'active' where user_id = p_user and status = 'pending';
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform private.audit(null, case when p_grant then 'role_granted' else 'role_revoked' end, 'user_roles', p_user::text, null,
    jsonb_build_object('role', p_role, 'region', p_region));
end $$;

-- حذف أي سجل — مدير النظام فقط، مع حفظ نسخة منه في سجل التدقيق
create or replace function public.admin_delete_record(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_school uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_table not in ('schools','students','drivers','guardians','buses','routes','trips') then raise exception 'INVALID_TABLE' using errcode = 'P0001'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table) into v_old using p_id;
  if v_old is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  v_school := case when p_table = 'schools' then null else nullif(v_old->>'school_id', '')::uuid end;
  perform set_config('masari.trusted', 'on', true);
  perform private.audit(v_school, 'admin_delete', p_table, p_id::text, v_old, null);
  execute format('delete from public.%I where id = $1', p_table) using p_id;
end $$;

revoke execute on function public.admin_set_platform_role(uuid, text, boolean, text), public.admin_delete_record(text, uuid) from anon, public;
grant execute on function public.admin_set_platform_role(uuid, text, boolean, text), public.admin_delete_record(text, uuid) to authenticated;
