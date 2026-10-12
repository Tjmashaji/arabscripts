-- حماية سجل الرحلات: لا يُحذف مسار له رحلات (يُؤرشف بدلًا من ذلك)، والحذف لمدير/مديرة المدرسة فقط.
-- يُشغَّل من SQL Editor في Supabase.
create or replace function private.guard_route_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_school_admin(old.school_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.trips t where t.route_id = old.id) then
    raise exception 'ROUTE_HAS_TRIPS' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists routes_guard_delete on public.routes;
create trigger routes_guard_delete before delete on public.routes
  for each row execute function private.guard_route_delete();
