-- مدير النظام: تغيير دور أي حساب، وحذف الحساب نهائيًا.
-- منفصل لأنه يحتوي عمليات حذف؛ يُشغَّل من SQL Editor في Supabase.

-- ───────── تغيير الدور ─────────
-- الأدوار: super_admin · executive (بمنطقة) · school_admin / operations (بمدرسة) · driver (بمدرسة) · guardian (بمدرسة)
create or replace function public.admin_set_user_role(p_user uuid, p_role text, p_grant boolean,
  p_school uuid default null, p_region text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text; v_name text; v_phone text; v_driver uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  select lower(u.email), coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1)), p.phone
    into v_email, v_name, v_phone
    from auth.users u left join public.profiles p on p.user_id = u.id where u.id = p_user;
  if v_email is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_role in ('school_admin','operations','driver','guardian') and p_grant and p_school is null then
    raise exception 'SCHOOL_REQUIRED' using errcode = 'P0001';
  end if;
  perform set_config('masari.trusted', 'on', true);

  if p_role in ('super_admin','executive') then
    if p_grant and p_role = 'executive' and coalesce(btrim(p_region), '') = '' then raise exception 'REGION_REQUIRED' using errcode = 'P0001'; end if;
    if p_grant then
      insert into public.user_roles(user_id, role, region, created_by)
        values (p_user, p_role, case when p_role = 'executive' then btrim(p_region) end, (select auth.uid()))
        on conflict (user_id, role) do update set region = excluded.region;
    else
      delete from public.user_roles where user_id = p_user and role = p_role;
    end if;
  elsif p_role in ('school_admin','operations') then
    if p_grant then
      insert into public.school_members(school_id, user_id, role, status, created_by)
        values (p_school, p_user, p_role, 'active', (select auth.uid()))
        on conflict (school_id, user_id) do update set role = excluded.role, status = 'active';
    else
      delete from public.school_members where user_id = p_user and (p_school is null or school_id = p_school);
    end if;
  elsif p_role = 'driver' then
    if p_grant then
      select id into v_driver from public.drivers where user_id = p_user;
      if v_driver is not null then
        update public.drivers set school_id = p_school, status = 'active' where id = v_driver;
      else
        select id into v_driver from public.drivers where school_id = p_school and lower(email) = v_email and user_id is null;
        if v_driver is not null then
          update public.drivers set user_id = p_user, status = 'active' where id = v_driver;
        else
          insert into public.drivers(school_id, user_id, full_name, phone, email, status) values (p_school, p_user, v_name, v_phone, v_email, 'active');
        end if;
      end if;
    else
      update public.drivers set user_id = null where user_id = p_user;
    end if;
  elsif p_role = 'guardian' then
    if p_grant then
      update public.guardians set user_id = p_user, status = 'active'
        where school_id = p_school and lower(email) = v_email and user_id is null;
      if not found then
        insert into public.guardians(school_id, user_id, full_name, phone, email, status)
          values (p_school, p_user, v_name, v_phone, v_email, 'active')
          on conflict (school_id, user_id) do update set status = 'active';
      end if;
    else
      update public.guardians set user_id = null where user_id = p_user and (p_school is null or school_id = p_school);
    end if;
  else
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  if p_grant then update public.profiles set status = 'active' where user_id = p_user and status = 'pending'; end if;
  perform private.audit(p_school, case when p_grant then 'role_granted' else 'role_revoked' end, 'profiles', p_user::text, null,
    jsonb_build_object('role', p_role, 'school', p_school, 'region', p_region));
end $$;
revoke execute on function public.admin_set_user_role(uuid, text, boolean, uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, boolean, uuid, text) to authenticated;

-- ───────── حذف الحساب نهائيًا ─────────
-- يُشترط كتابة البريد للتأكيد. تبقى سجلات المدرسة (الطلاب والرحلات…) وتُفك صلتها بالحساب.
create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text; r record;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then raise exception 'CONFIRM_MISMATCH' using errcode = 'P0001'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'CANNOT_DELETE_ADMIN' using errcode = 'P0001';
  end if;
  perform set_config('masari.trusted', 'on', true);
  perform private.audit(null, 'user_deleted', 'auth.users', p_user::text, jsonb_build_object('email', v_email), null);
  -- فك صلة الحساب بأي سجل يشير إليه دون حذف تلقائي
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace and c.confdeltype = 'a'
  loop
    if r.notnull then
      execute format('delete from %s where %I = $1', r.tbl, r.col) using p_user;
    else
      execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using p_user;
    end if;
  end loop;
  delete from auth.users where id = p_user;
end $$;
revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

