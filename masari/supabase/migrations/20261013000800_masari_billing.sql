-- اشتراك المدارس في مساري (مصدر دخل المنصة): باقات، اشتراك لكل مدرسة، وفواتير بضريبة 15%.
-- منفصل عن جداول subscriptions/invoices الحالية المخصصة لرسوم أولياء الأمور لدى المدرسة.

create table if not exists public.masari_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 60),
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  max_buses integer check (max_buses is null or max_buses > 0),
  max_students integer check (max_students is null or max_students > 0),
  description text check (description is null or length(description) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.school_subscriptions (
  school_id uuid primary key references public.schools(id) on delete cascade,
  plan_id uuid not null references public.masari_plans(id),
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly','term','yearly')),
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  starts_on date not null default current_date,
  ends_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create sequence if not exists private.masari_invoice_seq;
create table if not exists public.masari_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  school_id uuid not null references public.schools(id) on delete cascade,
  plan_name text not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  months numeric(5,2) not null check (months > 0),
  amount numeric(10,2) not null check (amount >= 0),
  vat numeric(10,2) not null check (vat >= 0),
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'issued' check (status in ('issued','paid','void')),
  due_date date not null,
  paid_at timestamptz,
  payment_ref text check (payment_ref is null or length(payment_ref) <= 120),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists masari_invoices_school_idx on public.masari_invoices (school_id, period_start desc);

alter table public.masari_plans enable row level security;
alter table public.school_subscriptions enable row level security;
alter table public.masari_invoices enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='masari_plans' and policyname='masari_plans_select') then
    create policy masari_plans_select on public.masari_plans for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='school_subscriptions' and policyname='school_subscriptions_select') then
    create policy school_subscriptions_select on public.school_subscriptions for select to authenticated
      using (private.is_executive_for(school_id) or private.is_school_admin(school_id));
  end if;
  if not exists (select 1 from pg_policies where tablename='masari_invoices' and policyname='masari_invoices_select') then
    create policy masari_invoices_select on public.masari_invoices for select to authenticated
      using (private.is_platform_admin() or private.is_school_admin(school_id));
  end if;
end $$;
revoke all on table public.masari_plans, public.school_subscriptions, public.masari_invoices from anon;

-- باقات افتراضية قابلة للتعديل من مدير النظام
insert into public.masari_plans (name, monthly_price, max_buses, max_students, description)
select * from (values
  ('الأساسية', 299.00, 3, 90, 'حتى 3 باصات و90 طالبًا'),
  ('المتوسطة', 799.00, 10, 300, 'حتى 10 باصات و300 طالب'),
  ('المؤسسية', 1999.00, null::int, null::int, 'باصات وطلاب بلا حد')
) v(name, monthly_price, max_buses, max_students, description)
where not exists (select 1 from public.masari_plans);

-- ── إدارة الباقات (مدير النظام)
create or replace function public.admin_save_plan(p_id uuid, p_name text, p_monthly_price numeric, p_max_buses integer, p_max_students integer, p_description text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.masari_plans (name, monthly_price, max_buses, max_students, description, is_active)
      values (btrim(p_name), p_monthly_price, p_max_buses, p_max_students, nullif(btrim(p_description), ''), coalesce(p_active, true)) returning id into v_id;
  else
    update public.masari_plans set name = btrim(p_name), monthly_price = p_monthly_price, max_buses = p_max_buses, max_students = p_max_students,
      description = nullif(btrim(p_description), ''), is_active = coalesce(p_active, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  perform private.audit(null, 'plan_saved', 'masari_plans', v_id::text, null, jsonb_build_object('name', p_name, 'price', p_monthly_price));
  return v_id;
end $$;

-- ── اشتراك مدرسة (مدير النظام)
create or replace function public.admin_set_school_subscription(p_school uuid, p_plan uuid, p_status text, p_period text, p_starts_on date, p_ends_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_price numeric;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select monthly_price into v_price from public.masari_plans where id = p_plan;
  if v_price is null then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.school_subscriptions (school_id, plan_id, status, billing_period, monthly_price, starts_on, ends_on, updated_at, updated_by)
    values (p_school, p_plan, p_status, p_period, v_price, coalesce(p_starts_on, current_date), p_ends_on, now(), (select auth.uid()))
  on conflict (school_id) do update set plan_id = excluded.plan_id, status = excluded.status, billing_period = excluded.billing_period,
    monthly_price = excluded.monthly_price, starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now(), updated_by = excluded.updated_by;
  perform private.audit(p_school, 'subscription_set', 'school_subscriptions', p_school::text, null,
    jsonb_build_object('plan', p_plan, 'status', p_status, 'period', p_period, 'ends_on', p_ends_on));
end $$;

-- ── إصدار فاتورة لفترة: السعر الشهري × عدد الأشهر + ضريبة 15%
create or replace function public.admin_issue_invoice(p_school uuid, p_period_start date, p_period_end date, p_due_days integer default 14, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.school_subscriptions; v_plan text; v_months numeric; v_amount numeric; v_vat numeric; v_no text; v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into s from public.school_subscriptions where school_id = p_school;
  if not found then raise exception 'NO_SUBSCRIPTION' using errcode = 'P0001'; end if;
  if p_period_end < p_period_start then raise exception 'INVALID_PERIOD' using errcode = 'P0001'; end if;
  if exists (select 1 from public.masari_invoices where school_id = p_school and status <> 'void' and daterange(period_start, period_end, '[]') && daterange(p_period_start, p_period_end, '[]')) then
    raise exception 'PERIOD_ALREADY_INVOICED' using errcode = 'P0001';
  end if;
  select name into v_plan from public.masari_plans where id = s.plan_id;
  -- أشهر تقويمية كاملة + الأيام المتبقية ÷ 30 (أكتوبر كامل = شهر واحد)
  v_months := round((extract(year from age(p_period_end + 1, p_period_start)) * 12 + extract(month from age(p_period_end + 1, p_period_start))
              + extract(day from age(p_period_end + 1, p_period_start)) / 30.0)::numeric, 2);
  v_amount := round(s.monthly_price * v_months, 2);
  v_vat := round(v_amount * 0.15, 2);
  v_no := 'MS-' || to_char(p_period_start, 'YYYY') || '-' || lpad(nextval('private.masari_invoice_seq')::text, 5, '0');
  insert into public.masari_invoices (number, school_id, plan_name, period_start, period_end, months, amount, vat, total, due_date, note, created_by)
    values (v_no, p_school, v_plan, p_period_start, p_period_end, v_months, v_amount, v_vat, v_amount + v_vat, current_date + coalesce(p_due_days, 14), nullif(btrim(p_note), ''), (select auth.uid()))
    returning id into v_id;
  perform private.notify_school_staff(p_school, 'masari_invoice', 'فاتورة اشتراك مساري ' || v_no,
    'المبلغ ' || (v_amount + v_vat) || ' ر.س شامل الضريبة، تستحق في ' || to_char(current_date + coalesce(p_due_days, 14), 'YYYY-MM-DD') || '.', 'masari_invoice:' || v_id, jsonb_build_object('invoice_id', v_id));
  perform private.audit(p_school, 'invoice_issued', 'masari_invoices', v_id::text, null, jsonb_build_object('number', v_no, 'total', v_amount + v_vat));
  return jsonb_build_object('id', v_id, 'number', v_no, 'total', v_amount + v_vat);
end $$;

create or replace function public.admin_set_invoice_status(p_invoice uuid, p_status text, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.masari_invoices;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('paid','void','issued') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  update public.masari_invoices set status = p_status, paid_at = case when p_status = 'paid' then now() end,
    payment_ref = case when p_status = 'paid' then nullif(btrim(p_ref), '') else payment_ref end
    where id = p_invoice returning * into i;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_status = 'paid' then
    update public.school_subscriptions set status = 'active' where school_id = i.school_id and status in ('trial','past_due');
  end if;
  perform private.audit(i.school_id, 'invoice_' || p_status, 'masari_invoices', p_invoice::text, null, jsonb_build_object('ref', p_ref));
end $$;

-- ملخص الاشتراك للمدرسة: الباقة والاستخدام مقابل الحدود
create or replace function public.my_school_billing(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (private.is_school_admin(p_school) or private.is_executive_for(p_school)) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'subscription', (select to_jsonb(s) || jsonb_build_object('plan_name', p.name, 'max_buses', p.max_buses, 'max_students', p.max_students)
                     from public.school_subscriptions s join public.masari_plans p on p.id = s.plan_id where s.school_id = p_school),
    'buses', (select count(*) from public.buses where school_id = p_school and status = 'active'),
    'students', (select count(*) from public.students where school_id = p_school and service_status = 'active'),
    'open_total', (select coalesce(sum(total), 0) from public.masari_invoices where school_id = p_school and status = 'issued')
  ) into v;
  return v;
end $$;

-- لوحة الاشتراكات لمدير النظام
create or replace function public.admin_billing_overview()
returns table (school_id uuid, school_name text, region text, school_status text, plan_id uuid, plan_name text, sub_status text, billing_period text,
               monthly_price numeric, ends_on date, buses bigint, students bigint, open_total numeric, last_invoice_end date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
  select s.id, s.name, s.region, s.status, sub.plan_id, p.name, sub.status, sub.billing_period, sub.monthly_price, sub.ends_on,
    (select count(*) from public.buses b where b.school_id = s.id and b.status = 'active'),
    (select count(*) from public.students st where st.school_id = s.id and st.service_status = 'active'),
    (select coalesce(sum(i.total), 0) from public.masari_invoices i where i.school_id = s.id and i.status = 'issued'),
    (select max(i.period_end) from public.masari_invoices i where i.school_id = s.id and i.status <> 'void')
  from public.schools s
  left join public.school_subscriptions sub on sub.school_id = s.id
  left join public.masari_plans p on p.id = sub.plan_id
  where s.status in ('active','suspended') or sub.school_id is not null
  order by s.name;
end $$;

revoke execute on function public.admin_save_plan(uuid, text, numeric, integer, integer, text, boolean), public.admin_set_school_subscription(uuid, uuid, text, text, date, date),
  public.admin_issue_invoice(uuid, date, date, integer, text), public.admin_set_invoice_status(uuid, text, text), public.my_school_billing(uuid), public.admin_billing_overview() from anon, public;
grant execute on function public.admin_save_plan(uuid, text, numeric, integer, integer, text, boolean), public.admin_set_school_subscription(uuid, uuid, text, text, date, date),
  public.admin_issue_invoice(uuid, date, date, integer, text), public.admin_set_invoice_status(uuid, text, text), public.my_school_billing(uuid), public.admin_billing_overview() to authenticated;

-- رقم الفاتورة الأول يبدأ من 1 (لا فواتير بعد)
select setval('private.masari_invoice_seq', 1, false) where not exists (select 1 from public.masari_invoices);
