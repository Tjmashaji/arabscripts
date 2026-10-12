-- «نداء البوابة»: ولي الأمر يصل للمدرسة ويضغط «أنا عند البوابة»، فتظهر للمدرسة فورًا لتسليم الطالب.
-- «التصاريح»: غياب أو استلام بنفسي أو خروج مبكر لأيام قادمة؛ تُطبَّق تلقائيًا عند بدء الرحلة.

create table if not exists public.pickup_calls (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','released','cancelled')),
  note text check (note is null or length(note) <= 200),
  call_date date not null default ((now() at time zone 'Asia/Riyadh')::date),
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists pickup_calls_one_waiting on public.pickup_calls (student_id) where status = 'waiting';
create index if not exists pickup_calls_school_day on public.pickup_calls (school_id, call_date, status);
create index if not exists pickup_calls_created_by on public.pickup_calls (created_by);
create index if not exists pickup_calls_released_by on public.pickup_calls (released_by);
alter table public.pickup_calls enable row level security;
create policy pickup_calls_select on public.pickup_calls for select to authenticated
  using (created_by = (select auth.uid()) or private.is_guardian_of(student_id) or private.can_view_school(school_id));
create policy pickup_calls_insert on public.pickup_calls for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'waiting' and released_by is null and private.is_guardian_of(student_id));
grant select, insert on public.pickup_calls to authenticated;

create or replace function private.prepare_pickup_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_grade text;
begin
  select school_id, full_name, grade into new.school_id, v_name, v_grade from public.students where id = new.student_id;
  new.call_date := private.riyadh_today();
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select m.user_id, new.school_id, 'pickup_call', 'نداء: ' || v_name,
         'ولي أمر ' || v_name || coalesce(' (' || v_grade || ')', '') || ' عند البوابة.' || coalesce(' ' || new.note, ''),
         jsonb_build_object('call_id', new.id, 'student_id', new.student_id), 'pickup_call:' || new.id
  from public.school_members m
  where m.school_id = new.school_id and m.status = 'active'
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;
create or replace trigger pickup_calls_prepare before insert on public.pickup_calls
  for each row execute function private.prepare_pickup_call();

-- المدرسة تسلّم الطالب، أو ولي الأمر يلغي النداء
create or replace function public.update_pickup_call(p_call uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.pickup_calls; v_name text;
begin
  select * into c from public.pickup_calls where id = p_call for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if c.status <> 'waiting' then raise exception 'ALREADY_CLOSED' using errcode = 'P0001'; end if;
  if p_status = 'released' then
    if not private.is_school_staff(c.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    select full_name into v_name from public.students where id = c.student_id;
    update public.pickup_calls set status = 'released', released_by = (select auth.uid()), released_at = now() where id = p_call;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (c.created_by, c.school_id, 'pickup_released', v_name || ' في الطريق إليك', 'سلّمت المدرسة ' || v_name || ' عند البوابة.',
            jsonb_build_object('call_id', p_call), 'pickup_released:' || p_call)
    on conflict (user_id, dedupe_key) do nothing;
  elsif p_status = 'cancelled' then
    if c.created_by <> (select auth.uid()) and not private.is_school_staff(c.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    update public.pickup_calls set status = 'cancelled' where id = p_call;
  else
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.update_pickup_call(uuid, text) from public, anon;
grant execute on function public.update_pickup_call(uuid, text) to authenticated;

-- ───────── التصاريح ─────────
create table if not exists public.student_permissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('absence','self_pickup','early_leave')),
  from_date date not null,
  to_date date not null,
  leave_time time,
  note text check (note is null or length(note) <= 300),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 60)
);
create index if not exists student_permissions_student on public.student_permissions (student_id, from_date, to_date) where status = 'active';
create index if not exists student_permissions_school on public.student_permissions (school_id, from_date);
create index if not exists student_permissions_created_by on public.student_permissions (created_by);
alter table public.student_permissions enable row level security;
create policy student_permissions_select on public.student_permissions for select to authenticated
  using (created_by = (select auth.uid()) or private.is_guardian_of(student_id) or private.can_view_school(school_id));
create policy student_permissions_insert on public.student_permissions for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'active' and private.is_guardian_of(student_id)
              and from_date >= (now() at time zone 'Asia/Riyadh')::date);
grant select, insert on public.student_permissions to authenticated;

create or replace function private.prepare_student_permission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_title text;
begin
  select school_id, full_name into new.school_id, v_name from public.students where id = new.student_id;
  v_title := case new.kind when 'absence' then 'تصريح غياب' when 'self_pickup' then 'استلام من ولي الأمر' else 'خروج مبكر' end;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select m.user_id, new.school_id, 'student_permission', v_title || ': ' || v_name,
         v_name || ' · ' || case when new.from_date = new.to_date then to_char(new.from_date, 'YYYY-MM-DD') else to_char(new.from_date, 'YYYY-MM-DD') || ' إلى ' || to_char(new.to_date, 'YYYY-MM-DD') end
           || coalesce(' · الساعة ' || to_char(new.leave_time, 'HH24:MI'), '') || coalesce(' · ' || new.note, ''),
         jsonb_build_object('permission_id', new.id), 'permission:' || new.id
  from public.school_members m
  where m.school_id = new.school_id and m.status = 'active' and m.role in ('school_admin','operations')
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;
create or replace trigger student_permissions_prepare before insert on public.student_permissions
  for each row execute function private.prepare_student_permission();

create or replace function public.cancel_student_permission(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.student_permissions set status = 'cancelled'
  where id = p_id and status = 'active' and (created_by = (select auth.uid()) or private.is_guardian_of(student_id));
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.cancel_student_permission(uuid) from public, anon;
grant execute on function public.cancel_student_permission(uuid) to authenticated;

-- عند إضافة الطالب لرحلة: إن كان له تصريح يشمل يومها واتجاهها يُسجَّل غائبًا عن هذه الرحلة
-- (غياب: الذهاب والعودة · استلام بنفسي أو خروج مبكر: رحلة العودة فقط)
create or replace function private.apply_student_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if new.status <> 'not_boarded' then return new; end if;
  select trip_date, direction into t from public.trips where id = new.trip_id;
  if exists (select 1 from public.student_permissions p
             where p.student_id = new.student_id and p.status = 'active'
               and t.trip_date between p.from_date and p.to_date
               and (p.kind = 'absence' or t.direction = 'to_home')) then
    new.status := 'absent';
  end if;
  return new;
end $$;
create or replace trigger trip_students_apply_permissions before insert on public.trip_students
  for each row execute function private.apply_student_permissions();

-- شاشة البوابة تتحدث لحظيًا
alter publication supabase_realtime add table public.pickup_calls;
