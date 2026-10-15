-- إصلاحات ولي الأمر: غياب اليوم يشمل الذهاب والعودة، ورد المدرسة على الملاحظات والشكاوى.

-- ═════════ غياب اليوم كله ═════════
-- يسجَّل تصريح غياب لليوم (فتُطبَّق على أي رحلة تُنشأ لاحقًا)، ويُطبَّق فورًا على رحلات اليوم التي لم تبدأ.
create or replace function public.guardian_absent_today(p_student uuid, p_absent boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare v_day date := private.riyadh_today(); t record; n int := 0;
begin
  if not private.is_guardian_of(p_student) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_absent then
    if not exists (select 1 from public.student_permissions where student_id = p_student and status = 'active' and kind = 'absence'
                   and v_day between from_date and to_date) then
      insert into public.student_permissions (student_id, school_id, kind, from_date, to_date, note)
        select p_student, s.school_id, 'absence', v_day, v_day, 'غياب اليوم من ولي الأمر' from public.students s where s.id = p_student;
    end if;
  else
    update public.student_permissions set status = 'cancelled'
      where student_id = p_student and status = 'active' and kind = 'absence' and from_date = v_day and to_date = v_day;
  end if;
  for t in select tr.id from public.trips tr
           join public.student_route_assignments a on a.route_id = tr.route_id and a.student_id = p_student and a.status = 'active'
           where tr.trip_date = v_day and tr.status in ('scheduled','ready') loop
    perform public.guardian_set_absence(t.id, p_student, p_absent);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.guardian_absent_today(uuid, boolean) to authenticated;

-- ═════════ رد المدرسة على الملاحظات ═════════
alter table public.ratings_feedback add column if not exists reply text check (reply is null or char_length(reply) <= 1000);
alter table public.ratings_feedback add column if not exists replied_at timestamptz;
alter table public.ratings_feedback add column if not exists replied_by uuid references auth.users(id) on delete set null;
create index if not exists ratings_feedback_author_idx on public.ratings_feedback(author_user_id, created_at desc);
create index if not exists ratings_feedback_replied_by_idx on public.ratings_feedback(replied_by);

create or replace function public.reply_feedback(p_id uuid, p_reply text, p_status text default 'closed') returns void
language plpgsql security definer set search_path = '' as $$
declare f public.ratings_feedback;
begin
  select * into f from public.ratings_feedback where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(f.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(btrim(p_reply), '') = '' then raise exception 'REPLY_REQUIRED' using errcode = 'P0001'; end if;
  if p_status not in ('in_review','closed') then raise exception 'BAD_STATUS' using errcode = '22023'; end if;
  update public.ratings_feedback set reply = btrim(p_reply), replied_at = now(), replied_by = (select auth.uid()), status = p_status, updated_at = now()
    where id = p_id;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  values (f.author_user_id, f.school_id, 'feedback_reply', 'ردت المدرسة على ' || coalesce(f.category, 'ملاحظتك'), left(btrim(p_reply), 200),
          jsonb_build_object('feedback_id', p_id), 'feedback_reply:' || p_id || ':' || now()::text)
  on conflict (user_id, dedupe_key) do nothing;
end $$;
grant execute on function public.reply_feedback(uuid, text, text) to authenticated;
