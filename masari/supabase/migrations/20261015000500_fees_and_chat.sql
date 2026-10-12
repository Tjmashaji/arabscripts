-- رسوم النقل من المدرسة لولي الأمر (إصدار، سداد بمرجع تحويل، تأكيد، تذكير تلقائي)،
-- ومحادثة مختصرة بين ولي الأمر والمدرسة.

create or replace function private.is_guardian_in_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardians g where g.user_id = (select auth.uid()) and g.school_id = p_school and g.status = 'active')
$$;
revoke execute on function private.is_guardian_in_school(uuid) from public, anon;
grant execute on function private.is_guardian_in_school(uuid) to authenticated;

-- ───────── رسوم النقل ─────────
create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  number text not null,
  title text not null check (length(title) between 3 and 120),
  amount numeric(10,2) not null check (amount > 0),
  vat_rate numeric(4,2) not null default 0 check (vat_rate between 0 and 0.25),
  total numeric(10,2) not null,
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid','claimed','paid','cancelled')),
  payment_ref text check (payment_ref is null or length(payment_ref) <= 120),
  paid_at timestamptz,
  note text check (note is null or length(note) <= 300),
  last_reminder_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fee_invoices_school on public.fee_invoices (school_id, status, due_date);
create index if not exists fee_invoices_student on public.fee_invoices (student_id);
create index if not exists fee_invoices_created_by on public.fee_invoices (created_by);
alter table public.fee_invoices enable row level security;
create policy fee_invoices_select on public.fee_invoices for select to authenticated
  using (private.can_view_school(school_id) or private.is_guardian_of(student_id));
grant select on public.fee_invoices to authenticated;

create or replace function private.notify_guardians_of(p_student uuid, p_school uuid, p_type text, p_title text, p_body text, p_data jsonb, p_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select distinct g.user_id, p_school, p_type, p_title, p_body, p_data, p_key
  from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id
  where gs.student_id = p_student and g.user_id is not null and g.status = 'active'
  on conflict (user_id, dedupe_key) do nothing
$$;
revoke execute on function private.notify_guardians_of(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;

-- إصدار فاتورة لكل طالب مختار (أو كل الطلاب المشتركين في النقل)
create or replace function public.school_issue_fees(p_school uuid, p_title text, p_amount numeric, p_due date,
  p_vat_rate numeric default 0, p_students uuid[] default null, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_id uuid; v_no text; v_school text;
begin
  if not private.is_school_admin(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  if p_due is null or p_due < private.riyadh_today() then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  select name into v_school from public.schools where id = p_school;
  for r in select s.id, s.full_name from public.students s
           where s.school_id = p_school and s.service_status = 'active' and (p_students is null or s.id = any(p_students))
  loop
    v_no := 'F' || to_char(now() at time zone 'Asia/Riyadh', 'YYMM') || '-' || upper(substr(md5(random()::text), 1, 5));
    insert into public.fee_invoices (school_id, student_id, number, title, amount, vat_rate, total, due_date, note, created_by)
      values (p_school, r.id, v_no, btrim(p_title), round(p_amount, 2), coalesce(p_vat_rate, 0), round(p_amount * (1 + coalesce(p_vat_rate, 0)), 2), p_due, nullif(btrim(p_note), ''), (select auth.uid()))
      returning id into v_id;
    perform private.notify_guardians_of(r.id, p_school, 'fee_invoice', 'فاتورة نقل جديدة: ' || r.full_name,
      v_school || ' · ' || btrim(p_title) || ' · ' || round(p_amount * (1 + coalesce(p_vat_rate, 0)), 2) || ' ر.س · تستحق ' || to_char(p_due, 'YYYY-MM-DD'),
      jsonb_build_object('invoice_id', v_id), 'fee:' || v_id);
    n := n + 1;
  end loop;
  perform private.audit(p_school, 'fees_issued', 'fee_invoices', null, null, jsonb_build_object('title', p_title, 'amount', p_amount, 'count', n));
  return n;
end $$;
revoke execute on function public.school_issue_fees(uuid, text, numeric, date, numeric, uuid[], text) from public, anon;
grant execute on function public.school_issue_fees(uuid, text, numeric, date, numeric, uuid[], text) to authenticated;

-- ولي الأمر يبلّغ عن السداد بمرجع التحويل، والمدرسة تؤكد أو تلغي
create or replace function public.guardian_claim_fee_paid(p_invoice uuid, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.fee_invoices; v_name text;
begin
  select * into f from public.fee_invoices where id = p_invoice for update;
  if not found or not private.is_guardian_of(f.student_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if f.status <> 'unpaid' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_ref), '') = '' then raise exception 'REF_REQUIRED' using errcode = 'P0001'; end if;
  update public.fee_invoices set status = 'claimed', payment_ref = btrim(p_ref) where id = p_invoice;
  select full_name into v_name from public.students where id = f.student_id;
  insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
  select m.user_id, f.school_id, 'fee_claimed', 'ولي أمر يبلّغ عن سداد', v_name || ' · فاتورة ' || f.number || ' · مرجع ' || btrim(p_ref),
         jsonb_build_object('invoice_id', p_invoice), 'fee_claim:' || p_invoice
  from public.school_members m where m.school_id = f.school_id and m.status = 'active' and m.role = 'school_admin'
  on conflict (user_id, dedupe_key) do nothing;
end $$;
revoke execute on function public.guardian_claim_fee_paid(uuid, text) from public, anon;
grant execute on function public.guardian_claim_fee_paid(uuid, text) to authenticated;

create or replace function public.school_set_fee_status(p_invoice uuid, p_status text, p_ref text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.fee_invoices; v_name text;
begin
  select * into f from public.fee_invoices where id = p_invoice for update;
  if not found or not private.is_school_admin(f.school_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('unpaid','paid','cancelled') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  update public.fee_invoices set status = p_status,
    paid_at = case when p_status = 'paid' then now() else null end,
    payment_ref = coalesce(nullif(btrim(p_ref), ''), case when p_status = 'unpaid' then null else payment_ref end)
  where id = p_invoice;
  select full_name into v_name from public.students where id = f.student_id;
  if p_status = 'paid' then
    perform private.notify_guardians_of(f.student_id, f.school_id, 'fee_paid', 'تم تأكيد السداد', v_name || ' · فاتورة ' || f.number || ' · ' || f.total || ' ر.س', jsonb_build_object('invoice_id', p_invoice), 'fee_paid:' || p_invoice);
  elsif p_status = 'unpaid' and f.status = 'claimed' then
    perform private.notify_guardians_of(f.student_id, f.school_id, 'fee_unconfirmed', 'لم يُؤكَّد السداد', v_name || ' · فاتورة ' || f.number || ': لم تجد المدرسة التحويل، راجعها.', jsonb_build_object('invoice_id', p_invoice), 'fee_unconf:' || p_invoice || ':' || to_char(now(), 'YYMMDDHH24MI'));
  end if;
  perform private.audit(f.school_id, 'fee_status', 'fee_invoices', p_invoice::text, jsonb_build_object('status', f.status), jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.school_set_fee_status(uuid, text, text) from public, anon;
grant execute on function public.school_set_fee_status(uuid, text, text) to authenticated;

-- تذكير يومي: قبل الاستحقاق بثلاثة أيام، ثم كل ثلاثة أيام بعد التأخر
create or replace function private.fee_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select f.*, s.full_name from public.fee_invoices f join public.students s on s.id = f.student_id
           where f.status = 'unpaid' and f.due_date <= private.riyadh_today() + 3
             and (f.last_reminder_at is null or f.last_reminder_at < now() - interval '3 days')
  loop
    perform private.notify_guardians_of(r.student_id, r.school_id, 'fee_reminder',
      case when r.due_date < private.riyadh_today() then 'فاتورة نقل متأخرة' else 'تذكير بفاتورة النقل' end,
      r.full_name || ' · ' || r.title || ' · ' || r.total || ' ر.س · ' || case when r.due_date < private.riyadh_today() then 'استحقت ' else 'تستحق ' end || to_char(r.due_date, 'YYYY-MM-DD'),
      jsonb_build_object('invoice_id', r.id), 'fee_rem:' || r.id || ':' || to_char(now(), 'YYMMDD'));
    update public.fee_invoices set last_reminder_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.fee_reminders() from public, anon, authenticated;
select cron.schedule('masari-fee-reminders', '5 6 * * *', $$select private.fee_reminders()$$)
where not exists (select 1 from cron.job where jobname = 'masari-fee-reminders');

-- ───────── المحادثة ─────────
create table if not exists public.school_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_user uuid not null references auth.users(id) on delete cascade,
  sender uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_school boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists school_messages_thread on public.school_messages (school_id, guardian_user, created_at);
create index if not exists school_messages_guardian on public.school_messages (guardian_user);
create index if not exists school_messages_sender on public.school_messages (sender);
alter table public.school_messages enable row level security;
create policy school_messages_select on public.school_messages for select to authenticated
  using (guardian_user = (select auth.uid()) or private.can_view_school(school_id));
create policy school_messages_insert on public.school_messages for insert to authenticated
  with check (sender = (select auth.uid()) and read_at is null and (
    (from_school = false and guardian_user = (select auth.uid()) and private.is_guardian_in_school(school_id))
    or (from_school = true and private.is_school_staff(school_id) and exists (
      select 1 from public.guardians g where g.user_id = guardian_user and g.school_id = school_messages.school_id))));
grant select, insert on public.school_messages to authenticated;

create or replace function private.notify_school_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.from_school then
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    values (new.guardian_user, new.school_id, 'school_message', 'رسالة من المدرسة', left(new.body, 140),
            jsonb_build_object('message_id', new.id), 'msg:' || new.id)
    on conflict (user_id, dedupe_key) do nothing;
  else
    select coalesce(nullif(btrim(p.full_name), ''), 'ولي أمر') into v_name from public.profiles p where p.user_id = new.guardian_user;
    insert into public.notifications (user_id, school_id, type, title, body, data, dedupe_key)
    select m.user_id, new.school_id, 'guardian_message', 'رسالة من ' || coalesce(v_name, 'ولي أمر'), left(new.body, 140),
           jsonb_build_object('message_id', new.id, 'guardian_user', new.guardian_user), 'msg:' || new.id
    from public.school_members m where m.school_id = new.school_id and m.status = 'active' and m.role in ('school_admin','operations','supervisor')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end $$;
create or replace trigger school_messages_notify after insert on public.school_messages
  for each row execute function private.notify_school_message();

-- تعليم رسائل الطرف الآخر كمقروءة
create or replace function public.mark_thread_read(p_school uuid, p_guardian uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_guardian = (select auth.uid()) then
    update public.school_messages set read_at = now() where school_id = p_school and guardian_user = p_guardian and from_school and read_at is null;
  elsif private.can_view_school(p_school) then
    update public.school_messages set read_at = now() where school_id = p_school and guardian_user = p_guardian and not from_school and read_at is null;
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.mark_thread_read(uuid, uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid, uuid) to authenticated;

-- قائمة المحادثات للمدرسة
create or replace function public.school_threads(p_school uuid)
returns table (guardian_user uuid, guardian_name text, students text, last_body text, last_at timestamptz, last_from_school boolean, unread bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_view_school(p_school) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select m.guardian_user,
    coalesce((select g.full_name from public.guardians g where g.user_id = m.guardian_user and g.school_id = p_school limit 1), 'ولي أمر'),
    (select string_agg(s.full_name, '، ') from public.guardians g join public.guardian_students gs on gs.guardian_id = g.id join public.students s on s.id = gs.student_id
      where g.user_id = m.guardian_user and g.school_id = p_school),
    (array_agg(m.body order by m.created_at desc))[1], max(m.created_at),
    (array_agg(m.from_school order by m.created_at desc))[1],
    count(*) filter (where not m.from_school and m.read_at is null)
  from public.school_messages m where m.school_id = p_school
  group by m.guardian_user order by max(m.created_at) desc;
end $$;
revoke execute on function public.school_threads(uuid) from public, anon;
grant execute on function public.school_threads(uuid) to authenticated;

alter publication supabase_realtime add table public.school_messages;
