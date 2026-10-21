-- مساعد التأكيد الآلي (المرحلة F): الصقه في SQL Editor لمشروع auto-parts-eu ثم Run. بعدها اضبط ap_private.contact_settings (README).
-- المرحلة F — مساعد التأكيد الآلي: مكالمة صوتية بالعربي (Vapi + Claude) عند صدور التسعيرة وعند إنشاء الطلب،
-- وإن لم يرد العميل تُرسل له رسالة واتساب. لا شيء يحدث بلا موافقة صريحة من العميل عند إرسال الطلب.
-- النتيجة (مؤكد/رافض/يطلب اتصالًا/غير واضح) تُسجَّل فقط، والإدارة تقرر؛ لا يتغير الطلب أو التسعيرة تلقائيًا.
--
-- التشغيل: قاعدة البيانات تُنشئ مهمة اتصال (ap_contact_jobs) وتنبّه الخادم عبر pg_net، والخادم (/api/contact/dispatch)
-- يستلم المهام بدالة محمية برمز عامل سري ثم يبدأ المكالمة. نتيجة المكالمة تصل من Vapi إلى /api/contact/webhook.
-- لا مفتاح service_role: الخادم يستدعي دالتين فقط، وكل منهما تتحقق من الرمز المخزّن في ap_private.contact_settings.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.ap_quote_requests add column auto_contact_consent_at timestamptz;

create type public.ap_contact_kind as enum ('quote_ready', 'order_confirm');
create type public.ap_contact_status as enum ('queued', 'calling', 'answered', 'no_answer', 'whatsapp_sent', 'failed', 'cancelled');
create type public.ap_contact_outcome as enum ('confirmed', 'declined', 'callback', 'unclear');

create table public.ap_contact_jobs (
  id uuid primary key default gen_random_uuid(),
  kind public.ap_contact_kind not null,
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  customer_quote_id uuid references public.ap_customer_quotes (id) on delete cascade,
  order_id uuid references public.ap_orders (id) on delete cascade,
  status public.ap_contact_status not null default 'queued',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_call_id text unique,
  outcome public.ap_contact_outcome,
  summary text check (char_length(summary) <= 2000),
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'quote_ready' and customer_quote_id is not null) or (kind = 'order_confirm' and order_id is not null))
);
create unique index ap_contact_jobs_quote_uq on public.ap_contact_jobs (customer_quote_id) where kind = 'quote_ready';
create unique index ap_contact_jobs_order_uq on public.ap_contact_jobs (order_id) where kind = 'order_confirm';
create index ap_contact_jobs_due_idx on public.ap_contact_jobs (next_attempt_at) where status = 'queued';
create index ap_contact_jobs_request_idx on public.ap_contact_jobs (request_id, created_at desc);
create trigger ap_contact_jobs_touch before update on public.ap_contact_jobs for each row execute function ap_private.touch_updated_at();
create trigger ap_contact_jobs_audit after insert or update or delete on public.ap_contact_jobs for each row execute function ap_private.audit_row();

-- الإعدادات في مخطط خاص غير منشور عبر API. تُضبط مرة من SQL Editor (انظر README «مساعد التأكيد الآلي»).
create table ap_private.contact_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  dispatch_url text check (dispatch_url is null or dispatch_url ~ '^https://'),
  worker_token text check (worker_token is null or char_length(worker_token) >= 32),
  call_hour_from int not null default 9 check (call_hour_from between 0 and 23),
  call_hour_to int not null default 21 check (call_hour_to between 1 and 24),
  max_attempts int not null default 2 check (max_attempts between 1 and 5)
);
insert into ap_private.contact_settings (id) values (true);
revoke all on ap_private.contact_settings from public, anon, authenticated;
alter table ap_private.contact_settings enable row level security;

-- ───────── القراءة ─────────
revoke all on public.ap_contact_jobs from anon, authenticated;
grant select on public.ap_contact_jobs to authenticated;
alter table public.ap_contact_jobs enable row level security;
-- الإدارة فقط؛ العميل لا يرى ملخص المكالمة.
create policy ap_contact_jobs_read on public.ap_contact_jobs for select to authenticated
  using (ap_private.has_permission('quotes.manage') or ap_private.has_permission('orders.manage_all'));

-- ───────── مساعدات ─────────
create or replace function ap_private.contact_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from ap_private.contact_settings s
    where s.worker_token is not null and p_token is not null and s.worker_token = p_token) $$;

-- تنبيه الخادم ليبدأ المكالمات. pg_net يرسل الطلب بعد اكتمال المعاملة، فالمهمة تكون محفوظة عند وصوله.
create or replace function ap_private.contact_kick() returns void
language plpgsql security definer set search_path = '' as $$
declare s ap_private.contact_settings;
begin
  select * into s from ap_private.contact_settings;
  if not s.enabled or s.dispatch_url is null or s.worker_token is null then return; end if;
  perform net.http_post(url := s.dispatch_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s.worker_token));
end $$;

-- تُشغَّل كل 10 دقائق: تلتقط المهام المؤجلة (خارج ساعات الاتصال أو إعادة المحاولة).
create or replace function ap_private.contact_sweep() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.ap_contact_jobs where status = 'queued' and next_attempt_at <= now()) then
    perform ap_private.contact_kick();
  end if;
end $$;

create or replace function ap_private.contact_on_quote_issued() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    -- إصدار أحدث يُغني عن الاتصال بخصوص الإصدار السابق.
    update public.ap_contact_jobs set status = 'cancelled'
      where request_id = new.request_id and kind = 'quote_ready' and status = 'queued' and customer_quote_id <> new.id;
    if exists (select 1 from public.ap_quote_requests where id = new.request_id and auto_contact_consent_at is not null) then
      insert into public.ap_contact_jobs (kind, request_id, customer_quote_id) values ('quote_ready', new.request_id, new.id)
        on conflict do nothing;
      perform ap_private.contact_kick();
    end if;
  end if;
  return new;
end $$;
create trigger ap_customer_quotes_contact after update on public.ap_customer_quotes
  for each row execute function ap_private.contact_on_quote_issued();

create or replace function ap_private.contact_on_order_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- العميل وافق، فلا داعي لمكالمة «التسعيرة جاهزة» إن لم تتم بعد.
  update public.ap_contact_jobs set status = 'cancelled'
    where request_id = new.request_id and kind = 'quote_ready' and status = 'queued';
  if exists (select 1 from public.ap_quote_requests where id = new.request_id and auto_contact_consent_at is not null) then
    insert into public.ap_contact_jobs (kind, request_id, order_id) values ('order_confirm', new.request_id, new.id)
      on conflict do nothing;
    perform ap_private.contact_kick();
  end if;
  return new;
end $$;
create trigger ap_orders_contact after insert on public.ap_orders
  for each row execute function ap_private.contact_on_order_created();

-- ما يحتاجه نص المكالمة ورسالة واتساب فقط (لا رقم هيكل ولا بيانات مورد).
create or replace function ap_private.contact_job_details(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id, 'kind', j.kind, 'attempt', j.attempts,
      'phone', r.contact_phone, 'name', r.contact_name,
      'reference', coalesce(o.reference, r.reference),
      'description', r.description, 'part_number', r.part_number, 'quantity', r.quantity, 'city', r.city,
      'vehicle', nullif(concat_ws(' ', b.name_ar, coalesce(m.name_ar, m.name), r.vehicle_year::text), ''),
      'total', coalesce(o.total, q.total), 'currency', coalesce(o.currency, q.currency),
      'valid_until', q.valid_until, 'estimated_delivery_days', q.estimated_delivery_days,
      'has_estimated', q.has_estimated) order by j.next_attempt_at), '[]'::jsonb)
  from public.ap_contact_jobs j
  join public.ap_quote_requests r on r.id = j.request_id
  left join public.ap_orders o on o.id = j.order_id
  left join public.ap_customer_quotes q on q.id = coalesce(j.customer_quote_id, o.customer_quote_id)
  left join public.ap_vehicle_brands b on b.id = r.brand_id
  left join public.ap_vehicle_models m on m.id = r.model_id
  where j.id = any (p_ids) $$;

-- ───────── دوال عامل الاتصال (الخادم، بلا جلسة مستخدم) ─────────
-- تستلم المهام المستحقة وتعيد ما يحتاجه نص المكالمة فقط. خارج ساعات الاتصال (توقيت الرياض) لا تعيد شيئًا.
create or replace function public.ap_contact_claim(p_token text, p_limit int default 5)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s ap_private.contact_settings; v_hour int; v_ids uuid[];
begin
  if not ap_private.contact_token_ok(p_token) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into s from ap_private.contact_settings;
  if not s.enabled then return '[]'::jsonb; end if;

  -- مهام فقدت معناها: التسعيرة لم تعد قائمة أو انتهت، أو الطلب تجاوز «بانتظار الدفع».
  update public.ap_contact_jobs j set status = 'cancelled'
    where j.status = 'queued' and (
      (j.kind = 'quote_ready' and not exists (select 1 from public.ap_customer_quotes q where q.id = j.customer_quote_id
        and q.status = 'issued' and (q.valid_until is null or q.valid_until > now())))
      or (j.kind = 'order_confirm' and not exists (select 1 from public.ap_orders o where o.id = j.order_id
        and o.status = 'awaiting_payment')));
  -- مكالمة بدأت ولم يصل تقريرها خلال ساعة.
  update public.ap_contact_jobs set status = 'failed', last_error = 'no report from call provider'
    where status = 'calling' and updated_at < now() - interval '1 hour';

  v_hour := extract(hour from now() at time zone 'Asia/Riyadh')::int;
  if v_hour < s.call_hour_from or v_hour >= s.call_hour_to then return '[]'::jsonb; end if;

  with picked as (
    select id from public.ap_contact_jobs where status = 'queued' and next_attempt_at <= now()
    order by next_attempt_at limit least(greatest(coalesce(p_limit, 5), 1), 20) for update skip locked),
  claimed as (
    update public.ap_contact_jobs j set status = 'calling', attempts = j.attempts + 1, last_error = null
      from picked where j.id = picked.id returning j.id)
  select array_agg(id) into v_ids from claimed;
  if v_ids is null then return '[]'::jsonb; end if;

  return ap_private.contact_job_details(v_ids);
end $$;

-- أحداث المكالمة. تعيد {"action":"whatsapp","job":{...}} حين يجب إرسال رسالة بديلة، وإلا {"action":"ok"}.
--   started        مزوّد المكالمات قبل الطلب (p_provider_ref = معرّف المكالمة)
--   answered       العميل رد: p_outcome وp_summary
--   no_answer      لم يرد أو مشغول أو بريد صوتي
--   whatsapp_sent  أُرسلت الرسالة البديلة
--   failed         تعذّر بدء المكالمة أو إرسال الرسالة: يُعاد المحاولة بعد 30 دقيقة حتى max_attempts
create or replace function public.ap_contact_report(p_token text, p_job uuid, p_event text, p_outcome text default null,
  p_summary text default null, p_provider_ref text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.ap_contact_jobs; v_max int;
begin
  if not ap_private.contact_token_ok(p_token) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_job is not null then
    select * into j from public.ap_contact_jobs where id = p_job for update;
  elsif p_provider_ref is not null then
    select * into j from public.ap_contact_jobs where provider_call_id = p_provider_ref for update;
  end if;
  if j.id is null then raise exception 'ap: contact job not found' using errcode = 'P0002'; end if;

  case p_event
    when 'started' then
      if j.status <> 'calling' or p_provider_ref is null then raise exception 'ap: job not calling' using errcode = 'P0001'; end if;
      update public.ap_contact_jobs set provider_call_id = left(p_provider_ref, 200) where id = j.id;
    when 'answered' then
      -- تقرير مكرر، إلا إن حمل نتيجة واضحة بعد تقرير نهاية مكالمة بلا نتيجة.
      if j.status not in ('calling', 'no_answer')
         and not (j.status = 'answered' and j.outcome = 'unclear' and coalesce(p_outcome, 'unclear') <> 'unclear') then
        return '{"action":"ok"}'::jsonb;
      end if;
      update public.ap_contact_jobs set status = 'answered',
        outcome = coalesce(p_outcome, 'unclear')::public.ap_contact_outcome, summary = left(nullif(btrim(p_summary), ''), 2000)
        where id = j.id;
    when 'no_answer' then
      if j.status <> 'calling' then return '{"action":"ok"}'::jsonb; end if;
      update public.ap_contact_jobs set status = 'no_answer', last_error = left(p_error, 500) where id = j.id;
      return jsonb_build_object('action', 'whatsapp', 'job', ap_private.contact_job_details(array[j.id])->0);
    when 'whatsapp_sent' then
      update public.ap_contact_jobs set status = 'whatsapp_sent' where id = j.id and status = 'no_answer';
    when 'failed' then
      if j.status not in ('calling', 'no_answer') then return '{"action":"ok"}'::jsonb; end if;
      select max_attempts into v_max from ap_private.contact_settings;
      update public.ap_contact_jobs set
        status = case when j.attempts < v_max then 'queued' else 'failed' end::public.ap_contact_status,
        next_attempt_at = now() + interval '30 minutes', provider_call_id = null, last_error = left(p_error, 500)
        where id = j.id;
    else
      raise exception 'ap: unknown event' using errcode = '22023';
  end case;
  return '{"action":"ok"}'::jsonb;
end $$;

-- الإدارة تعيد الاتصال يدويًا (بعد فشل أو عدم رد أو طلب العميل اتصالًا لاحقًا).
create or replace function public.ap_admin_requeue_contact(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (ap_private.has_permission('quotes.manage') or ap_private.has_permission('orders.manage_all')) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  update public.ap_contact_jobs set status = 'queued', next_attempt_at = now(), attempts = 0, outcome = null,
    summary = null, provider_call_id = null, last_error = null
    where id = p_job and status in ('answered', 'no_answer', 'whatsapp_sent', 'failed', 'cancelled');
  if not found then raise exception 'ap: job busy' using errcode = 'P0001'; end if;
  perform ap_private.contact_kick();
end $$;

-- ───────── موافقة العميل عند إرسال الطلب ─────────
drop function public.ap_create_quote_request(uuid, uuid, int, text, text, text, text, int, text, text, text, boolean, uuid, uuid);
create or replace function public.ap_create_quote_request(p_brand uuid, p_model uuid, p_year int, p_engine text, p_vin text,
  p_part_number text, p_description text, p_quantity int, p_city text, p_contact_name text, p_contact_phone text,
  p_privacy_accepted boolean, p_product uuid default null, p_offer uuid default null, p_auto_contact boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_vin text := upper(nullif(regexp_replace(coalesce(p_vin, ''), '\s', '', 'g'), ''));
begin
  if auth.uid() is null or not ap_private.is_active_user(auth.uid()) then raise exception 'ap: login required' using errcode = '42501'; end if;
  if not coalesce(p_privacy_accepted, false) then raise exception 'ap: privacy consent required' using errcode = '22023'; end if;
  -- حد بسيط ضد الإغراق: 10 طلبات في الساعة لكل عميل.
  if (select count(*) from public.ap_quote_requests where customer_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'ap: too many requests' using errcode = 'P0001';
  end if;
  if p_model is not null and not exists (select 1 from public.ap_vehicle_models m where m.id = p_model
                                         and (p_brand is null or m.brand_id = p_brand)) then
    raise exception 'ap: model does not match brand' using errcode = '22023';
  end if;
  if p_offer is not null and not exists (select 1 from public.ap_product_offers o where o.id = p_offer
                                         and o.product_id = p_product and ap_private.offer_public(o)) then
    raise exception 'ap: offer not available' using errcode = '22023';
  end if;
  if p_product is not null and not exists (select 1 from public.ap_products p where p.id = p_product and p.status = 'published') then
    raise exception 'ap: product not available' using errcode = '22023';
  end if;
  insert into public.ap_quote_requests (customer_id, brand_id, model_id, vehicle_year, engine, vin, part_number, description,
    quantity, city, contact_name, contact_phone, privacy_accepted_at, product_id, offer_id, auto_contact_consent_at)
  values (auth.uid(), coalesce(p_brand, (select brand_id from public.ap_vehicle_models where id = p_model)), p_model, p_year,
    nullif(btrim(p_engine), ''), v_vin, nullif(btrim(p_part_number), ''), btrim(p_description), coalesce(p_quantity, 1),
    btrim(p_city), btrim(p_contact_name), btrim(p_contact_phone), now(), p_product, p_offer,
    case when coalesce(p_auto_contact, false) then now() end)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.ap_create_quote_request(uuid, uuid, int, text, text, text, text, int, text, text, text, boolean, uuid, uuid, boolean),
  public.ap_admin_requeue_contact(uuid), public.ap_contact_claim(text, int),
  public.ap_contact_report(text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.ap_create_quote_request(uuid, uuid, int, text, text, text, text, int, text, text, text, boolean, uuid, uuid, boolean),
  public.ap_admin_requeue_contact(uuid) to authenticated;
-- الخادم يستدعيهما بالمفتاح العام بلا جلسة؛ الحماية بالرمز السري داخل الدالة.
grant execute on function public.ap_contact_claim(text, int),
  public.ap_contact_report(text, uuid, text, text, text, text, text) to anon, authenticated;
revoke all on function ap_private.contact_token_ok(text), ap_private.contact_job_details(uuid[]), ap_private.contact_kick(), ap_private.contact_sweep(),
  ap_private.contact_on_quote_issued(), ap_private.contact_on_order_created() from public, anon, authenticated;

select cron.schedule('ap-contact-sweep', '*/10 * * * *', 'select ap_private.contact_sweep()');
