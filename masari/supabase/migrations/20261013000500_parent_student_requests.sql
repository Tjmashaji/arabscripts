-- المرحلة ٢: ولي الأمر يطلب تسجيل ابنه في نقل مدرسة مشتركة، والمدرسة تراجع وتقبل أو ترفض.
-- عند القبول تُنشئ review_student_request الطالب وتربطه بحساب ولي الأمر مباشرة.

alter table public.student_onboarding_requests add column if not exists student_national_id text;
alter table public.student_onboarding_requests add column if not exists note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'student_requests_national_id_format') then
    alter table public.student_onboarding_requests add constraint student_requests_national_id_format
      check (student_national_id is null or student_national_id ~ '^[12][0-9]{9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'student_requests_note_length') then
    alter table public.student_onboarding_requests add constraint student_requests_note_length check (note is null or length(note) <= 500);
  end if;
end $$;

-- طلب مفتوح واحد لكل ابن عند المدرسة نفسها من ولي الأمر نفسه
create unique index if not exists student_requests_one_open
  on public.student_onboarding_requests (school_id, created_by, lower(btrim(student_name)))
  where status in ('pending','pending_parent_account');

-- طلب ولي الأمر يجب أن يحدد موقع المنزل (لتحديد المحطة)
create or replace function private.validate_parent_student_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_school_staff(new.school_id) then
    if new.home_latitude is null or new.home_longitude is null then raise exception 'HOME_LOCATION_REQUIRED' using errcode = 'P0001'; end if;
    if coalesce(length(btrim(new.student_name)), 0) < 3 then raise exception 'STUDENT_NAME_REQUIRED' using errcode = 'P0001'; end if;
    if coalesce(length(btrim(new.parent_phone)), 0) < 9 then raise exception 'PHONE_REQUIRED' using errcode = 'P0001'; end if;
    new.parent_email := (select lower(email) from auth.users where id = (select auth.uid()));
  end if;
  return new;
end $$;
create or replace trigger student_requests_validate_parent before insert on public.student_onboarding_requests
  for each row execute function private.validate_parent_student_request();

-- إشعار إدارة المدرسة بطلب ولي أمر جديد
create or replace function private.notify_school_new_student_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null and not exists (
       select 1 from public.school_members m where m.user_id = new.created_by and m.school_id = new.school_id) then
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, new.school_id, 'student_request', 'طلب تسجيل طالب جديد',
           coalesce(nullif(btrim(new.parent_name), ''), 'ولي أمر') || ' يطلب تسجيل ' || new.student_name || ' في النقل.',
           jsonb_build_object('request_id', new.id), 'student_request:' || new.id
    from public.school_members m
    where m.school_id = new.school_id and m.status = 'active' and m.role in ('school_admin','operations')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end $$;
create or replace trigger student_requests_notify_school after insert on public.student_onboarding_requests
  for each row execute function private.notify_school_new_student_request();

-- مراجعة الطلب: كما كانت، مع إشعار ولي الأمر صاحب الطلب بالقبول أو الرفض
create or replace function public.review_student_request(p_request uuid, p_approve boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.student_onboarding_requests; v_student uuid; v_guardian uuid;
  v_parent_user uuid; v_parent_email text; v_school_name text;
begin
  select * into r from public.student_onboarding_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_school_staff(r.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if r.status not in ('pending','pending_parent_account') then raise exception 'ALREADY_REVIEWED' using errcode = 'P0001'; end if;
  select name into v_school_name from public.schools where id = r.school_id;

  if r.created_by is not null and not exists (
       select 1 from public.school_members m where m.user_id = r.created_by and m.school_id = r.school_id) then
    v_parent_user := r.created_by;
    select lower(email) into v_parent_email from auth.users where id = v_parent_user;
  else
    v_parent_email := nullif(lower(btrim(r.parent_email)), '');
  end if;

  if not p_approve then
    if coalesce(btrim(p_note), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.student_onboarding_requests
      set status = 'rejected', review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
      where id = p_request;
    if v_parent_user is not null then
      insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
      values (v_parent_user, r.school_id, 'student_request_rejected', 'لم يُقبل طلب تسجيل ' || r.student_name,
              v_school_name || ': ' || btrim(p_note), jsonb_build_object('request_id', p_request), 'student_request_result:' || p_request)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    return null;
  end if;

  begin
    insert into public.students(school_id, full_name, grade, home_address, home_latitude, home_longitude,
        pickup_contact_name, pickup_contact_phone, service_status)
      values (r.school_id, btrim(r.student_name), r.grade, r.home_address, r.home_latitude, r.home_longitude,
        r.parent_name, r.parent_phone, 'active')
      returning id into v_student;
  exception when unique_violation then
    raise exception 'DUPLICATE_STUDENT' using errcode = 'P0001';
  end;

  if v_parent_user is not null then
    select id into v_guardian from public.guardians where school_id = r.school_id and user_id = v_parent_user;
  end if;
  if v_guardian is null and v_parent_email is not null then
    select id into v_guardian from public.guardians where school_id = r.school_id and lower(email) = v_parent_email;
  end if;
  if v_guardian is null then
    insert into public.guardians(school_id, user_id, full_name, phone, email, status)
      values (r.school_id, v_parent_user, coalesce(nullif(btrim(r.parent_name), ''), 'ولي الأمر'), r.parent_phone, v_parent_email, 'active')
      returning id into v_guardian;
  elsif v_parent_user is not null then
    update public.guardians set user_id = v_parent_user, status = 'active' where id = v_guardian and user_id is null;
  end if;

  insert into public.guardian_students(guardian_id, student_id, relation, is_primary)
    values (v_guardian, v_student, 'parent', true) on conflict (guardian_id, student_id) do nothing;

  if v_parent_user is not null then
    perform set_config('masari.trusted', 'on', true);
    update public.profiles set status = 'active' where user_id = v_parent_user and status = 'pending';
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (v_parent_user, r.school_id, 'student_request_approved', 'تم قبول تسجيل ' || r.student_name,
            v_school_name || ' قبلت الطلب. ستحدد المدرسة المسار والمحطة، ثم تظهر الرحلات هنا.',
            jsonb_build_object('request_id', p_request, 'student_id', v_student), 'student_request_result:' || p_request)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  update public.student_onboarding_requests
    set status = 'approved', student_id = v_student, review_note = p_note, reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_request;
  return v_student;
end $$;

-- طلبات ولي الأمر مع اسم المدرسة
create or replace function public.my_student_requests()
returns table (id uuid, school_id uuid, school_name text, student_name text, grade text, status text, review_note text, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.school_id, s.name, r.student_name, r.grade, r.status, r.review_note, r.created_at, r.reviewed_at
  from public.student_onboarding_requests r join public.schools s on s.id = r.school_id
  where r.created_by = (select auth.uid())
    and not exists (select 1 from public.school_members m where m.user_id = r.created_by and m.school_id = r.school_id)
  order by r.created_at desc
  limit 50
$$;
revoke execute on function public.my_student_requests() from anon, public;
grant execute on function public.my_student_requests() to authenticated;
