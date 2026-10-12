-- حذف الحساب كاملًا من داخل التطبيق (شرط Apple App Store 5.1.1(v)).
-- يُشغَّل يدويًا من SQL Editor لأنه يحتوي حذفًا.

create or replace function private.purge_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform set_config('masari.trusted', 'on', true);
  -- بيانات ولي الأمر الشخصية (الاسم والجوال) تُحذف مع ربطه بالأبناء؛ الطلاب يبقون في مدرستهم
  delete from public.guardians where user_id = p_user;
  -- السجلات المرتبطة بالحساب: يُحذف ما لا يعيش بدونه، ويُفك ارتباط الباقي (سجلات الرحلات تبقى للمدرسة بلا هوية)
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
  -- ملفات رفعها الحساب (قد تمنعها حماية التخزين؛ عندها تبقى ملفات المدرسة كما هي)
  begin delete from storage.objects where owner = p_user; exception when others then null; end;
  delete from auth.users where id = p_user;
end $$;
revoke all on function private.purge_user(uuid) from public, anon, authenticated;

create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001'; end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then raise exception 'CONFIRM_MISMATCH' using errcode = 'P0001'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'CANNOT_DELETE_ADMIN' using errcode = 'P0001';
  end if;
  perform private.audit(null, 'user_deleted', 'auth.users', p_user::text, jsonb_build_object('email', v_email), null);
  perform private.purge_user(p_user);
end $$;
revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- المستخدم يحذف حسابه بنفسه بعد كتابة بريده للتأكيد
create or replace function public.delete_my_account(p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then raise exception 'CONFIRM_MISMATCH' using errcode = 'P0001'; end if;
  if exists (select 1 from public.user_roles where user_id = v_uid and role = 'super_admin')
     and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  perform private.audit(null, 'account_self_deleted', 'auth.users', v_uid::text, null, null);
  perform private.purge_user(v_uid);
end $$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
