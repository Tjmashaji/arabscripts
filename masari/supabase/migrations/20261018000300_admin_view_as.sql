-- مدير النظام: «الدخول كـ» مدرسة أو سائق أو ولي أمر لمعاينة ما يراه ودعمه. لا يُنشئ جلسة باسم المستخدم:
-- القراءة تمر عبر صلاحيات مدير النظام نفسها (RLS)، وإجراءات السائق وولي الأمر تبقى مرفوضة لأنها تتحقق من صاحب الحساب.
-- كل دخول يُسجَّل في سجل التدقيق باسم المدير.
create or replace function public.admin_view_as(p_kind text, p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_kind = 'school' then
    select jsonb_build_object('kind', 'school', 'school_id', s.id, 'school_name', s.name, 'label', s.name) into v
      from public.schools s where s.id = p_target and s.status = 'active';
  elsif p_kind = 'driver' then
    select jsonb_build_object('kind', 'driver', 'driver_id', d.id, 'school_id', d.school_id, 'school_name', s.name, 'label', d.full_name) into v
      from public.drivers d join public.schools s on s.id = d.school_id where d.id = p_target;
  elsif p_kind = 'parent' then
    select jsonb_build_object('kind', 'parent', 'user_id', g.user_id, 'school_id', g.school_id, 'school_name', s.name, 'label', g.full_name) into v
      from public.guardians g join public.schools s on s.id = g.school_id where g.id = p_target and g.user_id is not null;
  else
    raise exception 'BAD_KIND' using errcode = '22023';
  end if;
  if v is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.audit((v->>'school_id')::uuid, 'admin_view_as', p_kind, p_target::text, null, v);
  return v;
end $$;
grant execute on function public.admin_view_as(text, uuid) to authenticated;
