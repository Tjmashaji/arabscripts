-- طلبات المستخدم (اهتمامات وطلبات تفعيل) وقائمة طلبات التفعيل للإدارة مع اسم المدرسة.
-- المدارس غير المفعّلة لا تُقرأ مباشرة من جدول schools، لذا تُعرض الأسماء عبر دوال محددة الأعمدة.

create or replace function public.my_school_requests()
returns table (school_id uuid, name text, district text, city text, status text, my_interest boolean, my_claim_status text,
               reject_reason text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select i.school_id, i.created_at from public.school_interest i where i.user_id = (select auth.uid())
    union all
    select c.school_id, c.created_at from public.school_claim_requests c where c.user_id = (select auth.uid())
  )
  select s.id, s.name, s.district, s.city, s.status,
    exists (select 1 from public.school_interest i where i.school_id = s.id and i.user_id = (select auth.uid())),
    (select c.status from public.school_claim_requests c where c.school_id = s.id and c.user_id = (select auth.uid()) order by c.created_at desc limit 1),
    (select c.reject_reason from public.school_claim_requests c where c.school_id = s.id and c.user_id = (select auth.uid()) order by c.created_at desc limit 1),
    max(m.created_at)
  from mine m join public.schools s on s.id = m.school_id
  group by s.id
  order by max(m.created_at) desc
  limit 50
$$;

create or replace function public.admin_claim_requests(p_status text default null)
returns table (id uuid, school_id uuid, school_name text, school_district text, school_status text, contact_name text, "position" text,
               phone text, email text, note text, status text, reject_reason text, created_at timestamptz, interest_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_executive() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select c.id, s.id, s.name, s.district, s.status, c.contact_name, c.position, c.phone, c.email, c.note, c.status, c.reject_reason, c.created_at,
    (select count(*) from public.school_interest i where i.school_id = s.id)
  from public.school_claim_requests c join public.schools s on s.id = c.school_id
  where (p_status is null and c.status in ('new','contacting')) or c.status = p_status
  order by (c.status = 'new') desc, c.created_at
  limit 300;
end $$;

revoke execute on function public.my_school_requests() from anon, public;
revoke execute on function public.admin_claim_requests(text) from anon, public;
grant execute on function public.my_school_requests() to authenticated;
grant execute on function public.admin_claim_requests(text) to authenticated;
