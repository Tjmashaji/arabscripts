-- المرحلتان C ثم D معًا: الصقه كاملًا في SQL Editor لمشروع auto-parts ثم Run (مرة واحدة).
-- المرحلة C — طلبات التسعير: العميل يطلب قطعة (أو تأكيد سعر وتوفر من صفحة منتج)، الإدارة ترسل الطلب لموردين معتمدين،
-- الموردون يقدّمون عروضهم، الإدارة تقارن وتبني تسعيرة مفصّلة بإصدارات وتاريخ صلاحية، والعميل يوافق فيُحفظ snapshot ثابت
-- ويُنشأ طلب شراء بحالة awaiting_payment. لا يوجد تحصيل أموال: حالة الدفع unpaid ولا يغيّرها العميل.
-- الخصوصية: المورد لا يرى اسم العميل ولا هاتفه أبدًا، ولا يرى رقم الهيكل (VIN) إلا إن قررت الإدارة مشاركته.

create type public.ap_quote_request_status as enum
  ('submitted', 'reviewing', 'sourcing', 'quoted', 'accepted', 'declined', 'expired', 'cancelled');
create type public.ap_supplier_quote_status as enum ('submitted', 'withdrawn', 'selected', 'rejected', 'expired');
create type public.ap_customer_quote_status as enum ('draft', 'issued', 'accepted', 'declined', 'superseded', 'expired');
create type public.ap_cost_line_code as enum
  ('part', 'international_shipping', 'local_shipping', 'customs', 'tax', 'service_fee', 'discount', 'other');
create type public.ap_cost_line_status as enum ('confirmed', 'estimated');
create type public.ap_order_status as enum
  ('draft', 'awaiting_payment', 'paid', 'processing', 'ready_to_ship', 'shipped', 'in_transit', 'customs_clearance',
   'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed');

create sequence public.ap_quote_request_ref_seq start 100001;
create sequence public.ap_order_ref_seq start 100001;

-- ───────── طلب التسعير ─────────
create table public.ap_quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('RQ-' || nextval('public.ap_quote_request_ref_seq')::text),
  customer_id uuid not null references public.ap_profiles (user_id) on delete restrict,
  brand_id uuid references public.ap_vehicle_brands (id),
  model_id uuid references public.ap_vehicle_models (id),
  vehicle_year int check (vehicle_year between 1990 and 2100),
  engine text check (char_length(engine) <= 80),
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  part_number text check (char_length(part_number) <= 60),
  description text not null check (char_length(description) between 3 and 2000),
  quantity int not null default 1 check (quantity between 1 and 999),
  city text not null check (char_length(city) between 2 and 80),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  privacy_accepted_at timestamptz not null,
  product_id uuid references public.ap_products (id) on delete set null,
  offer_id uuid references public.ap_product_offers (id) on delete set null,
  status public.ap_quote_request_status not null default 'submitted',
  admin_notes text check (char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_quote_requests_customer_idx on public.ap_quote_requests (customer_id, created_at desc);
create index ap_quote_requests_status_idx on public.ap_quote_requests (status, created_at desc);

-- صور القطعة أو اللوحة. المسار: <customer_id>/<request_id>/<uuid>.<ext> في مستودع خاص.
create table public.ap_quote_request_media (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now()
);

-- لمن أُرسل الطلب، وهل يرى المورد رقم الهيكل.
create table public.ap_quote_request_suppliers (
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  organization_id uuid not null references public.ap_organizations (id) on delete restrict,
  share_vin boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  primary key (request_id, organization_id)
);
create index ap_quote_request_suppliers_org_idx on public.ap_quote_request_suppliers (organization_id, invited_at desc);

-- عرض المورد: عرض واحد لكل منشأة لكل طلب (يُحدَّث بدل التكرار).
create table public.ap_supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  organization_id uuid not null references public.ap_organizations (id) on delete restrict,
  part_type public.ap_part_type not null,
  unit_price numeric(12, 2) not null check (unit_price > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  quantity_available int check (quantity_available is null or quantity_available >= 0),
  lead_time_days int check (lead_time_days between 0 and 365),
  origin_country char(2) check (origin_country ~ '^[A-Z]{2}$'),
  valid_until timestamptz not null,
  compatibility_notes text check (char_length(compatibility_notes) <= 2000),
  status public.ap_supplier_quote_status not null default 'submitted',
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, organization_id)
);

-- تسعيرة العميل: إصدارات متتالية؛ الإصدار المعتمد هو الأحدث فقط.
create table public.ap_customer_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  version int not null check (version >= 1),
  status public.ap_customer_quote_status not null default 'draft',
  currency char(3) not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  total numeric(12, 2),
  has_estimated boolean not null default false,
  valid_until timestamptz,
  estimated_delivery_days int check (estimated_delivery_days between 1 and 365),
  cancellation_terms text check (char_length(cancellation_terms) <= 2000),
  seller_of_record text check (char_length(seller_of_record) <= 200),
  supplier_quote_id uuid references public.ap_supplier_quotes (id) on delete restrict,
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  issued_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  decline_reason text check (char_length(decline_reason) <= 1000),
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version)
);

-- بنود التكلفة: كل بند بمبلغه وحالته (مؤكد/تقديري) ومصدره والمستفيد منه. الخصم فقط سالب.
create table public.ap_customer_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.ap_customer_quotes (id) on delete cascade,
  code public.ap_cost_line_code not null,
  description text check (char_length(description) <= 300),
  quantity int not null default 1 check (quantity between 1 and 999),
  unit_amount numeric(12, 2) not null,
  amount numeric(12, 2) generated always as (unit_amount * quantity) stored,
  status public.ap_cost_line_status not null default 'confirmed',
  source text check (char_length(source) <= 200),
  beneficiary text check (char_length(beneficiary) <= 200),
  valid_until timestamptz,
  sort_order int not null default 0,
  check ((code = 'discount' and unit_amount < 0) or (code <> 'discount' and unit_amount >= 0))
);
create index ap_customer_quote_lines_quote_idx on public.ap_customer_quote_lines (quote_id, sort_order);

-- ───────── طلب الشراء ─────────
create table public.ap_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('ORD-' || nextval('public.ap_order_ref_seq')::text),
  customer_id uuid not null references public.ap_profiles (user_id) on delete restrict,
  request_id uuid not null references public.ap_quote_requests (id) on delete restrict,
  customer_quote_id uuid not null unique references public.ap_customer_quotes (id) on delete restrict,
  status public.ap_order_status not null default 'awaiting_payment',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  total numeric(12, 2) not null,
  currency char(3) not null,
  accepted_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_orders_customer_idx on public.ap_orders (customer_id, created_at desc);

create table public.ap_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ap_orders (id) on delete cascade,
  code public.ap_cost_line_code not null,
  description text,
  quantity int not null,
  unit_amount numeric(12, 2) not null,
  amount numeric(12, 2) not null,
  status public.ap_cost_line_status not null,
  sort_order int not null default 0
);

create table public.ap_order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.ap_orders (id) on delete cascade,
  from_status public.ap_order_status,
  to_status public.ap_order_status not null,
  note text check (char_length(note) <= 1000),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create trigger ap_quote_requests_touch before update on public.ap_quote_requests for each row execute function ap_private.touch_updated_at();
create trigger ap_supplier_quotes_touch before update on public.ap_supplier_quotes for each row execute function ap_private.touch_updated_at();
create trigger ap_customer_quotes_touch before update on public.ap_customer_quotes for each row execute function ap_private.touch_updated_at();
create trigger ap_orders_touch before update on public.ap_orders for each row execute function ap_private.touch_updated_at();
create trigger ap_quote_requests_audit after insert or update or delete on public.ap_quote_requests for each row execute function ap_private.audit_row();
create trigger ap_quote_request_suppliers_audit after insert or update or delete on public.ap_quote_request_suppliers for each row execute function ap_private.audit_row();
create trigger ap_supplier_quotes_audit after insert or update or delete on public.ap_supplier_quotes for each row execute function ap_private.audit_row();
create trigger ap_customer_quotes_audit after insert or update or delete on public.ap_customer_quotes for each row execute function ap_private.audit_row();
create trigger ap_orders_audit after insert or update or delete on public.ap_orders for each row execute function ap_private.audit_row();

-- ───────── مساعدات ─────────
-- هل المستخدم الحالي عضو في منشأة دُعيت لهذا الطلب وما زالت معتمدة للبيع؟
create or replace function ap_private.request_invited_org(p_request uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.organization_id from public.ap_quote_request_suppliers s
  where s.request_id = p_request and ap_private.is_org_member(s.organization_id) and ap_private.org_can_sell(s.organization_id)
  order by s.invited_at limit 1 $$;

create or replace function ap_private.request_owner(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ap_quote_requests r
    where r.id = p_request and r.customer_id = auth.uid() and ap_private.is_active_user(auth.uid())) $$;

-- ───────── الصلاحيات و RLS ─────────
-- العميل يقرأ طلباته وتسعيراته المُصدَرة وطلبات شرائه؛ الإدارة (quotes.manage) تقرأ الكل.
-- المورد لا يقرأ الجداول مباشرة: يصل لما دُعي إليه عبر ap_supplier_requests بأعمدة آمنة فقط.
revoke all on public.ap_quote_requests, public.ap_quote_request_media, public.ap_quote_request_suppliers,
  public.ap_supplier_quotes, public.ap_customer_quotes, public.ap_customer_quote_lines, public.ap_orders,
  public.ap_order_items, public.ap_order_status_history from anon, authenticated;
revoke all on sequence public.ap_quote_request_ref_seq, public.ap_order_ref_seq from anon, authenticated;
grant select on public.ap_quote_requests, public.ap_quote_request_media, public.ap_quote_request_suppliers,
  public.ap_supplier_quotes, public.ap_customer_quotes, public.ap_customer_quote_lines, public.ap_orders,
  public.ap_order_items, public.ap_order_status_history to authenticated;

alter table public.ap_quote_requests enable row level security;
alter table public.ap_quote_request_media enable row level security;
alter table public.ap_quote_request_suppliers enable row level security;
alter table public.ap_supplier_quotes enable row level security;
alter table public.ap_customer_quotes enable row level security;
alter table public.ap_customer_quote_lines enable row level security;
alter table public.ap_orders enable row level security;
alter table public.ap_order_items enable row level security;
alter table public.ap_order_status_history enable row level security;

create policy ap_quote_requests_read on public.ap_quote_requests for select to authenticated
  using (customer_id = (select auth.uid()) or ap_private.has_permission('quotes.manage'));
create policy ap_quote_request_media_read on public.ap_quote_request_media for select to authenticated
  using (exists (select 1 from public.ap_quote_requests r where r.id = request_id));
create policy ap_quote_request_suppliers_read on public.ap_quote_request_suppliers for select to authenticated
  using (ap_private.has_permission('quotes.manage') or ap_private.is_org_member(organization_id));
-- المورد يرى عرضه هو فقط، ولا يرى عروض المنافسين.
create policy ap_supplier_quotes_read on public.ap_supplier_quotes for select to authenticated
  using (ap_private.has_permission('quotes.manage') or ap_private.is_org_member(organization_id));
-- العميل لا يرى المسودات.
create policy ap_customer_quotes_read on public.ap_customer_quotes for select to authenticated
  using (ap_private.has_permission('quotes.manage')
         or (status <> 'draft' and ap_private.request_owner(request_id)));
create policy ap_customer_quote_lines_read on public.ap_customer_quote_lines for select to authenticated
  using (exists (select 1 from public.ap_customer_quotes q where q.id = quote_id));
create policy ap_orders_read on public.ap_orders for select to authenticated
  using (customer_id = (select auth.uid()) or ap_private.has_permission('orders.manage_all') or ap_private.has_permission('quotes.manage'));
create policy ap_order_items_read on public.ap_order_items for select to authenticated
  using (exists (select 1 from public.ap_orders o where o.id = order_id));
create policy ap_order_status_history_read on public.ap_order_status_history for select to authenticated
  using (exists (select 1 from public.ap_orders o where o.id = order_id));

-- مستودع خاص لصور الطلبات. القراءة: العميل صاحب الطلب، الإدارة، والمورد المدعو (عبر رابط مؤقت يُسجَّل).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ap-request-media', 'ap-request-media', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy ap_request_media_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'ap-request-media' and (
    ap_private.has_permission('quotes.manage')
    or ((storage.foldername(name))[1] = (select auth.uid())::text)
    or ap_private.request_invited_org(((storage.foldername(name))[2])::uuid) is not null));
create policy ap_request_media_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ap-request-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.ap_quote_requests r where r.id = ((storage.foldername(name))[2])::uuid
                and r.customer_id = (select auth.uid()) and r.status in ('submitted', 'reviewing')));
create policy ap_request_media_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ap-request-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────── دوال العميل ─────────
create or replace function public.ap_create_quote_request(p_brand uuid, p_model uuid, p_year int, p_engine text, p_vin text,
  p_part_number text, p_description text, p_quantity int, p_city text, p_contact_name text, p_contact_phone text,
  p_privacy_accepted boolean, p_product uuid default null, p_offer uuid default null)
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
    quantity, city, contact_name, contact_phone, privacy_accepted_at, product_id, offer_id)
  values (auth.uid(), coalesce(p_brand, (select brand_id from public.ap_vehicle_models where id = p_model)), p_model, p_year,
    nullif(btrim(p_engine), ''), v_vin, nullif(btrim(p_part_number), ''), btrim(p_description), coalesce(p_quantity, 1),
    btrim(p_city), btrim(p_contact_name), btrim(p_contact_phone), now(), p_product, p_offer)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_add_request_media(p_request uuid, p_path text, p_mime text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.ap_quote_requests r where r.id = p_request and ap_private.request_owner(r.id)
                 and r.status in ('submitted', 'reviewing')) then
    raise exception 'ap: request not editable' using errcode = '42501';
  end if;
  if p_path not like auth.uid()::text || '/' || p_request::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'ap-request-media' and name = p_path) then
    raise exception 'ap: invalid media path' using errcode = '22023';
  end if;
  if (select count(*) from public.ap_quote_request_media where request_id = p_request) >= 6 then
    raise exception 'ap: too many images' using errcode = 'P0001';
  end if;
  insert into public.ap_quote_request_media (request_id, storage_path, mime_type) values (p_request, p_path, p_mime) returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_cancel_quote_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.request_owner(p_request) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_quote_requests set status = 'cancelled'
    where id = p_request and status in ('submitted', 'reviewing', 'sourcing', 'quoted');
  if not found then raise exception 'ap: request not cancellable' using errcode = 'P0001'; end if;
  update public.ap_customer_quotes set status = 'superseded' where request_id = p_request and status in ('draft', 'issued');
end $$;

-- موافقة العميل: على أحدث إصدار مُصدَر وغير منتهٍ فقط. تُحفظ نسخة ثابتة (snapshot) ويُنشأ طلب شراء بانتظار الدفع.
create or replace function public.ap_accept_customer_quote(p_quote uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.ap_customer_quotes; r public.ap_quote_requests; v_snapshot jsonb; v_order uuid;
begin
  select * into q from public.ap_customer_quotes where id = p_quote for update;
  if not found then raise exception 'ap: quote not found' using errcode = 'P0002'; end if;
  select * into r from public.ap_quote_requests where id = q.request_id for update;
  if not ap_private.request_owner(r.id) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if q.status <> 'issued' or r.status <> 'quoted' then raise exception 'ap: quote not acceptable' using errcode = 'P0001'; end if;
  if q.valid_until is not null and q.valid_until <= now() then
    raise exception 'ap: quote expired' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ap_customer_quotes x where x.request_id = q.request_id and x.version > q.version and x.status <> 'draft') then
    raise exception 'ap: newer version exists' using errcode = 'P0001';
  end if;

  v_snapshot := jsonb_build_object(
    'reference', r.reference, 'version', q.version, 'currency', q.currency, 'total', q.total,
    'has_estimated', q.has_estimated, 'valid_until', q.valid_until, 'estimated_delivery_days', q.estimated_delivery_days,
    'cancellation_terms', q.cancellation_terms, 'seller_of_record', q.seller_of_record, 'accepted_at', now(),
    'request', jsonb_build_object('description', r.description, 'part_number', r.part_number, 'quantity', r.quantity,
                                  'brand_id', r.brand_id, 'model_id', r.model_id, 'vehicle_year', r.vehicle_year, 'city', r.city),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'description', l.description, 'quantity', l.quantity,
      'unit_amount', l.unit_amount, 'amount', l.amount, 'status', l.status) order by l.sort_order, l.id)
      from public.ap_customer_quote_lines l where l.quote_id = q.id), '[]'::jsonb));

  update public.ap_customer_quotes set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), snapshot = v_snapshot
    where id = q.id;
  update public.ap_customer_quotes set status = 'superseded' where request_id = q.request_id and id <> q.id and status in ('draft', 'issued');
  update public.ap_quote_requests set status = 'accepted' where id = r.id;

  insert into public.ap_orders (customer_id, request_id, customer_quote_id, total, currency, accepted_snapshot)
    values (r.customer_id, r.id, q.id, q.total, q.currency, v_snapshot) returning id into v_order;
  insert into public.ap_order_items (order_id, code, description, quantity, unit_amount, amount, status, sort_order)
    select v_order, l.code, l.description, l.quantity, l.unit_amount, l.amount, l.status, l.sort_order
    from public.ap_customer_quote_lines l where l.quote_id = q.id;
  insert into public.ap_order_status_history (order_id, from_status, to_status, changed_by)
    values (v_order, null, 'awaiting_payment', auth.uid());
  return v_order;
end $$;

create or replace function public.ap_decline_customer_quote(p_quote uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.ap_customer_quotes;
begin
  select * into q from public.ap_customer_quotes where id = p_quote for update;
  if not found or not ap_private.request_owner(q.request_id) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if q.status <> 'issued' then raise exception 'ap: quote not declinable' using errcode = 'P0001'; end if;
  update public.ap_customer_quotes set status = 'declined', decline_reason = nullif(btrim(p_reason), '') where id = q.id;
  update public.ap_quote_requests set status = 'declined' where id = q.request_id and status = 'quoted';
end $$;

-- ───────── دوال الإدارة ─────────
create or replace function public.ap_admin_update_request_status(p_request uuid, p_status public.ap_quote_request_status,
  p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  -- الحالات quoted/accepted/declined تتغير عبر التسعيرة وقرار العميل فقط.
  if p_status not in ('reviewing', 'sourcing', 'expired', 'cancelled') then raise exception 'ap: invalid status' using errcode = '22023'; end if;
  update public.ap_quote_requests set status = p_status, admin_notes = coalesce(nullif(btrim(p_notes), ''), admin_notes)
    where id = p_request and status not in ('accepted', 'declined', 'cancelled', 'expired');
  if not found then raise exception 'ap: request closed' using errcode = 'P0001'; end if;
  if p_status in ('expired', 'cancelled') then
    update public.ap_customer_quotes set status = 'superseded' where request_id = p_request and status in ('draft', 'issued');
  end if;
end $$;

-- إرسال الطلب لموردين: كل منشأة يجب أن تكون نشطة ومعتمدة للبيع. يُخطَر أعضاؤها.
create or replace function public.ap_admin_send_request_to_suppliers(p_request uuid, p_orgs uuid[], p_share_vin boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare v_org uuid; n int := 0; r public.ap_quote_requests; v_new boolean;
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into r from public.ap_quote_requests where id = p_request;
  if not found or r.status not in ('submitted', 'reviewing', 'sourcing', 'quoted') then
    raise exception 'ap: request closed' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_orgs, 1), 0) = 0 then raise exception 'ap: no suppliers' using errcode = '22023'; end if;
  foreach v_org in array p_orgs loop
    if not ap_private.org_can_sell(v_org) then raise exception 'ap: organization not approved to sell' using errcode = '22023'; end if;
    insert into public.ap_quote_request_suppliers (request_id, organization_id, share_vin, invited_by)
      values (p_request, v_org, coalesce(p_share_vin, false), auth.uid())
      on conflict (request_id, organization_id) do update set share_vin = excluded.share_vin
      returning (xmax = 0) into v_new;
    -- الإشعار عند الدعوة الأولى فقط، لا عند تعديل مشاركة رقم الهيكل.
    if v_new then perform ap_private.notify(m.user_id, 'quote_request_invited', jsonb_build_object('request_id', p_request, 'reference', r.reference))
      from public.ap_organization_members m where m.organization_id = v_org and m.status = 'active'; end if;
    n := n + 1;
  end loop;
  update public.ap_quote_requests set status = 'sourcing' where id = p_request and status in ('submitted', 'reviewing');
  return n;
end $$;

-- مسودة تسعيرة جديدة (الإصدار التالي). عرض المورد المختار يجب أن يكون مقدّمًا وغير منتهٍ.
create or replace function public.ap_admin_create_customer_quote(p_request uuid, p_supplier_quote uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r public.ap_quote_requests; sq public.ap_supplier_quotes;
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into r from public.ap_quote_requests where id = p_request for update;
  if not found or r.status not in ('submitted', 'reviewing', 'sourcing', 'quoted') then
    raise exception 'ap: request closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ap_customer_quotes where request_id = p_request and status = 'draft') then
    raise exception 'ap: draft already exists' using errcode = 'P0001';
  end if;
  if p_supplier_quote is not null then
    select * into sq from public.ap_supplier_quotes where id = p_supplier_quote;
    if not found or sq.request_id <> p_request or sq.status not in ('submitted', 'selected') or sq.valid_until <= now() then
      raise exception 'ap: supplier quote not usable' using errcode = '22023';
    end if;
  end if;
  insert into public.ap_customer_quotes (request_id, version, supplier_quote_id, created_by)
    values (p_request, coalesce((select max(version) from public.ap_customer_quotes where request_id = p_request), 0) + 1,
            p_supplier_quote, auth.uid())
    returning id into v_id;
  -- بند القطعة مبدئيًا من عرض المورد إن كان بالريال؛ غير ذلك يُدخله المدير بعد التحويل.
  if p_supplier_quote is not null and sq.currency = 'SAR' then
    insert into public.ap_customer_quote_lines (quote_id, code, quantity, unit_amount, status, source, sort_order)
      values (v_id, 'part', r.quantity, sq.unit_price, 'confirmed', 'supplier_quote', 0);
  end if;
  return v_id;
end $$;

-- استبدال بنود المسودة كاملة. لا تعديل بعد الإصدار.
create or replace function public.ap_admin_set_quote_lines(p_quote uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.ap_customer_quotes where id = p_quote and status = 'draft') then
    raise exception 'ap: quote not editable' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 30 then
    raise exception 'ap: invalid lines' using errcode = '22023';
  end if;
  delete from public.ap_customer_quote_lines where quote_id = p_quote;
  insert into public.ap_customer_quote_lines (quote_id, code, description, quantity, unit_amount, status, source, beneficiary,
    valid_until, sort_order)
  select p_quote, (e->>'code')::public.ap_cost_line_code, nullif(btrim(e->>'description'), ''),
    coalesce((e->>'quantity')::int, 1), (e->>'unit_amount')::numeric,
    coalesce((e->>'status')::public.ap_cost_line_status, 'confirmed'), nullif(btrim(e->>'source'), ''),
    nullif(btrim(e->>'beneficiary'), ''), nullif(e->>'valid_until', '')::timestamptz, (ord - 1)::int
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(e, ord);
end $$;

-- إصدار التسعيرة للعميل: القاعدة تحسب الإجمالي ووجود بنود تقديرية؛ الإصدار السابق يصبح superseded.
create or replace function public.ap_admin_issue_customer_quote(p_quote uuid, p_valid_until timestamptz,
  p_estimated_delivery_days int, p_cancellation_terms text, p_seller_of_record text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.ap_customer_quotes; r public.ap_quote_requests; v_total numeric; v_est boolean;
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into q from public.ap_customer_quotes where id = p_quote for update;
  if not found or q.status <> 'draft' then raise exception 'ap: quote not editable' using errcode = 'P0001'; end if;
  select * into r from public.ap_quote_requests where id = q.request_id for update;
  if r.status not in ('submitted', 'reviewing', 'sourcing', 'quoted') then raise exception 'ap: request closed' using errcode = 'P0001'; end if;
  if p_valid_until is null or p_valid_until <= now() + interval '1 hour' then
    raise exception 'ap: validity required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_cancellation_terms), '') = '' or coalesce(btrim(p_seller_of_record), '') = '' then
    raise exception 'ap: terms required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ap_customer_quote_lines where quote_id = q.id and code = 'part') then
    raise exception 'ap: part line required' using errcode = '22023';
  end if;
  select sum(amount), bool_or(status = 'estimated') into v_total, v_est from public.ap_customer_quote_lines where quote_id = q.id;
  if v_total is null or v_total <= 0 then raise exception 'ap: total must be positive' using errcode = '22023'; end if;

  update public.ap_customer_quotes set status = 'superseded' where request_id = q.request_id and id <> q.id and status = 'issued';
  update public.ap_customer_quotes set status = 'issued', total = v_total, has_estimated = coalesce(v_est, false),
    valid_until = p_valid_until, estimated_delivery_days = p_estimated_delivery_days,
    cancellation_terms = btrim(p_cancellation_terms), seller_of_record = btrim(p_seller_of_record),
    notes = nullif(btrim(p_notes), ''), issued_at = now(), issued_by = auth.uid()
  where id = q.id;
  if q.supplier_quote_id is not null then
    update public.ap_supplier_quotes set status = 'selected' where id = q.supplier_quote_id and status = 'submitted';
  end if;
  update public.ap_quote_requests set status = 'quoted' where id = r.id;
  perform ap_private.notify(r.customer_id, 'customer_quote_issued',
    jsonb_build_object('request_id', r.id, 'reference', r.reference, 'version', q.version));
end $$;

-- ───────── دوال المورد ─────────
-- الطلبات المرسلة لمنشآت المستخدم: بلا اسم العميل وهاتفه، ورقم الهيكل فقط إن سُمح بمشاركته.
create or replace function public.ap_supplier_requests(p_request uuid default null)
returns table (id uuid, reference text, organization_id uuid, status public.ap_quote_request_status, brand_id uuid, model_id uuid,
  vehicle_year int, engine text, vin text, part_number text, description text, quantity int, city text, product_id uuid,
  invited_at timestamptz, media_count int, my_quote_id uuid, my_quote_status public.ap_supplier_quote_status)
language sql stable security definer set search_path = '' as $$
  select r.id, r.reference, s.organization_id, r.status, r.brand_id, r.model_id, r.vehicle_year, r.engine,
    case when s.share_vin then r.vin end, r.part_number, r.description, r.quantity, r.city, r.product_id, s.invited_at,
    (select count(*)::int from public.ap_quote_request_media m where m.request_id = r.id),
    sq.id, sq.status
  from public.ap_quote_request_suppliers s
  join public.ap_quote_requests r on r.id = s.request_id
  left join public.ap_supplier_quotes sq on sq.request_id = r.id and sq.organization_id = s.organization_id
  where ap_private.is_org_member(s.organization_id) and ap_private.org_can_sell(s.organization_id)
    and (p_request is null or r.id = p_request)
  order by s.invited_at desc
  limit 200
$$;

create or replace function public.ap_supplier_request_media(p_request uuid)
returns table (id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := ap_private.request_invited_org(p_request);
begin
  if v_org is null then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  perform ap_private.log('request_media_view', 'ap_quote_requests', p_request::text, v_org, '{}'::jsonb);
  return query select m.id, m.storage_path from public.ap_quote_request_media m where m.request_id = p_request order by m.created_at;
end $$;

create or replace function public.ap_submit_supplier_quote(p_request uuid, p_org uuid, p_part_type public.ap_part_type,
  p_unit_price numeric, p_currency text, p_quantity_available int, p_lead_time_days int, p_origin_country text,
  p_valid_until timestamptz, p_compatibility_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (ap_private.is_org_member(p_org) and ap_private.org_can_sell(p_org)
          and exists (select 1 from public.ap_quote_request_suppliers where request_id = p_request and organization_id = p_org)) then
    raise exception 'ap: not invited' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ap_quote_requests where id = p_request and status in ('sourcing', 'quoted', 'reviewing')) then
    raise exception 'ap: request closed' using errcode = 'P0001';
  end if;
  if p_valid_until is null or p_valid_until <= now() then raise exception 'ap: validity required' using errcode = '22023'; end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception 'ap: price required' using errcode = '22023'; end if;
  insert into public.ap_supplier_quotes (request_id, organization_id, part_type, unit_price, currency, quantity_available,
    lead_time_days, origin_country, valid_until, compatibility_notes, submitted_by)
  values (p_request, p_org, p_part_type, p_unit_price, upper(p_currency), p_quantity_available, p_lead_time_days,
    upper(nullif(btrim(p_origin_country), '')), p_valid_until, nullif(btrim(p_compatibility_notes), ''), auth.uid())
  on conflict (request_id, organization_id) do update set part_type = excluded.part_type, unit_price = excluded.unit_price,
    currency = excluded.currency, quantity_available = excluded.quantity_available, lead_time_days = excluded.lead_time_days,
    origin_country = excluded.origin_country, valid_until = excluded.valid_until,
    compatibility_notes = excluded.compatibility_notes, submitted_by = excluded.submitted_by, status = 'submitted'
    where public.ap_supplier_quotes.status in ('submitted', 'withdrawn')
  returning id into v_id;
  if v_id is null then raise exception 'ap: quote locked' using errcode = 'P0001'; end if;
  return v_id;
end $$;

create or replace function public.ap_withdraw_supplier_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.ap_supplier_quotes where id = p_quote;
  if v_org is null or not ap_private.is_org_member(v_org) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_supplier_quotes set status = 'withdrawn' where id = p_quote and status = 'submitted';
  if not found then raise exception 'ap: quote locked' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.ap_create_quote_request(uuid, uuid, int, text, text, text, text, int, text, text, text, boolean, uuid, uuid),
  public.ap_add_request_media(uuid, text, text), public.ap_cancel_quote_request(uuid),
  public.ap_accept_customer_quote(uuid), public.ap_decline_customer_quote(uuid, text),
  public.ap_admin_update_request_status(uuid, public.ap_quote_request_status, text),
  public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean),
  public.ap_admin_create_customer_quote(uuid, uuid), public.ap_admin_set_quote_lines(uuid, jsonb),
  public.ap_admin_issue_customer_quote(uuid, timestamptz, int, text, text, text),
  public.ap_supplier_requests(uuid), public.ap_supplier_request_media(uuid),
  public.ap_submit_supplier_quote(uuid, uuid, public.ap_part_type, numeric, text, int, int, text, timestamptz, text),
  public.ap_withdraw_supplier_quote(uuid) from public, anon;
grant execute on function public.ap_create_quote_request(uuid, uuid, int, text, text, text, text, int, text, text, text, boolean, uuid, uuid),
  public.ap_add_request_media(uuid, text, text), public.ap_cancel_quote_request(uuid),
  public.ap_accept_customer_quote(uuid), public.ap_decline_customer_quote(uuid, text),
  public.ap_admin_update_request_status(uuid, public.ap_quote_request_status, text),
  public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean),
  public.ap_admin_create_customer_quote(uuid, uuid), public.ap_admin_set_quote_lines(uuid, jsonb),
  public.ap_admin_issue_customer_quote(uuid, timestamptz, int, text, text, text),
  public.ap_supplier_requests(uuid), public.ap_supplier_request_media(uuid),
  public.ap_submit_supplier_quote(uuid, uuid, public.ap_part_type, numeric, text, int, int, text, timestamptz, text),
  public.ap_withdraw_supplier_quote(uuid) to authenticated;

revoke all on function ap_private.request_invited_org(uuid), ap_private.request_owner(uuid) from public;
grant execute on function ap_private.request_invited_org(uuid), ap_private.request_owner(uuid) to authenticated;

-- المرحلة D — الشحن والتشغيل: خدمات الناقلين، عروض الشحن اليدوية، الشحنات وأحداثها ومستنداتها،
-- انتقالات حالة الطلب المسموحة، تسجيل دفعة مستلمة خارج المنصة، تقارير الإدارة، ونسبة رسوم الخدمة.
-- القواعد: لا تكامل شحن آلي ولا دفع إلكتروني (لا تحصيل أموال)؛ لا شحن قبل تسجيل الدفع وجاهزية الطلب؛
-- الناقل يرى بيانات التسليم اللازمة فقط (لا أسعار القطع ولا هوية المورد ولا رقم الهيكل)؛ لا يُحتسب الشحن مرتين.

create type public.ap_shipping_mode as enum ('air', 'sea', 'express', 'land');
create type public.ap_shipping_quote_status as enum ('requested', 'submitted', 'selected', 'rejected', 'expired', 'withdrawn');
create type public.ap_shipment_status as enum
  ('assigned', 'accepted', 'picked_up', 'in_transit', 'customs_clearance', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled');
create type public.ap_shipment_doc_kind as enum ('proof_of_delivery', 'invoice', 'waybill', 'other');

create sequence public.ap_shipment_ref_seq start 100001;

insert into public.ap_platform_settings (key, value, description, is_public) values
  ('service_fee_percent', '0', 'نسبة رسوم خدمة المنصة المقترحة في التسعيرة (من سعر القطعة). 0 = لا اقتراح', false)
on conflict (key) do nothing;

-- ───────── خدمات الناقل ومناطق التغطية ─────────
create table public.ap_carrier_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ap_organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  mode public.ap_shipping_mode not null,
  origin_countries text[] not null default '{}' check (array_length(origin_countries, 1) is null or array_length(origin_countries, 1) <= 30),
  destination_countries text[] not null default '{}' check (array_length(destination_countries, 1) is null or array_length(destination_countries, 1) <= 30),
  transit_days_min int check (transit_days_min between 0 and 365),
  transit_days_max int check (transit_days_max between 0 and 365),
  notes text check (char_length(notes) <= 1000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_carrier_services_org_idx on public.ap_carrier_services (organization_id);

-- ───────── عروض الشحن (يدوية؛ جاهزة لاحقًا لمصدر آلي عبر pricing_source وprovider_quote_reference) ─────────
create table public.ap_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ap_quote_requests (id) on delete cascade,
  carrier_id uuid references public.ap_organizations (id) on delete restrict,
  carrier_name text check (char_length(carrier_name) <= 120),
  mode public.ap_shipping_mode not null,
  origin_country char(2) not null check (origin_country ~ '^[A-Z]{2}$'),
  origin_city text check (char_length(origin_city) <= 80),
  destination_country char(2) not null default 'SA' check (destination_country ~ '^[A-Z]{2}$'),
  destination_city text not null check (char_length(destination_city) between 2 and 80),
  pieces int not null default 1 check (pieces between 1 and 999),
  weight_kg numeric(10, 3) not null check (weight_kg > 0),
  volumetric_weight_kg numeric(10, 3) check (volumetric_weight_kg is null or volumetric_weight_kg > 0),
  length_cm numeric(8, 1) check (length_cm > 0), width_cm numeric(8, 1) check (width_cm > 0), height_cm numeric(8, 1) check (height_cm > 0),
  price numeric(12, 2) check (price is null or price > 0),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  delivery_estimate_days int check (delivery_estimate_days between 1 and 365),
  valid_until timestamptz,
  provider_quote_reference text check (char_length(provider_quote_reference) <= 120),
  pricing_source text not null check (pricing_source in ('carrier_portal', 'admin_manual')),
  status public.ap_shipping_quote_status not null default 'requested',
  notes text check (char_length(notes) <= 1000),
  requested_by uuid references auth.users (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (carrier_id is not null or carrier_name is not null),
  check (status = 'requested' or (price is not null and currency is not null and valid_until is not null))
);
create index ap_shipping_quotes_request_idx on public.ap_shipping_quotes (request_id);
create index ap_shipping_quotes_carrier_idx on public.ap_shipping_quotes (carrier_id, created_at desc);

alter table public.ap_customer_quotes add column shipping_quote_id uuid references public.ap_shipping_quotes (id) on delete restrict;
alter table public.ap_orders add column supplier_org_id uuid references public.ap_organizations (id) on delete restrict;
alter table public.ap_orders add column shipping_quote_id uuid references public.ap_shipping_quotes (id) on delete restrict;

-- ───────── الدفعات المسجلة يدويًا (لا تحصيل عبر المنصة) ─────────
-- تسجّل المالية دفعة استلمها البائع المسؤول خارج المنصة (تحويل بنكي مثلًا). الاسترداد والتسوية كيانان منفصلان لاحقًا.
create table public.ap_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ap_orders (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null,
  method text not null check (method in ('bank_transfer', 'cash_on_delivery', 'other')),
  reference text not null check (char_length(reference) between 2 and 120),
  received_by text not null check (char_length(received_by) between 2 and 200),
  note text check (char_length(note) <= 1000),
  status text not null default 'confirmed' check (status in ('confirmed', 'voided')),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create unique index ap_payments_one_confirmed on public.ap_payments (order_id) where status = 'confirmed';

-- ───────── الشحنات ─────────
create table public.ap_shipments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SHP-' || nextval('public.ap_shipment_ref_seq')::text),
  order_id uuid not null references public.ap_orders (id) on delete restrict,
  shipping_quote_id uuid references public.ap_shipping_quotes (id) on delete restrict,
  carrier_id uuid references public.ap_organizations (id) on delete restrict,
  carrier_name text check (char_length(carrier_name) <= 120),
  mode public.ap_shipping_mode not null,
  tracking_number text check (char_length(tracking_number) between 3 and 80),
  status public.ap_shipment_status not null default 'assigned',
  pieces int not null default 1 check (pieces between 1 and 999),
  weight_kg numeric(10, 3) check (weight_kg > 0),
  volumetric_weight_kg numeric(10, 3) check (volumetric_weight_kg > 0),
  origin_country char(2) check (origin_country ~ '^[A-Z]{2}$'),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  destination_city text not null check (char_length(destination_city) between 2 and 80),
  destination_address text not null check (char_length(destination_address) between 5 and 500),
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (carrier_id is not null or carrier_name is not null)
);
-- شحنة نشطة واحدة لكل طلب (يمكن إنشاء أخرى بعد الإلغاء أو الفشل أو الإرجاع).
create unique index ap_shipments_one_active on public.ap_shipments (order_id) where status not in ('cancelled', 'failed', 'returned');
create index ap_shipments_carrier_idx on public.ap_shipments (carrier_id, created_at desc);

create table public.ap_shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.ap_shipments (id) on delete cascade,
  status public.ap_shipment_status not null,
  location text check (char_length(location) <= 120),
  note text check (char_length(note) <= 1000),
  source text not null check (source in ('carrier', 'admin')),
  recorded_by uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index ap_shipment_events_idx on public.ap_shipment_events (shipment_id, occurred_at);

create table public.ap_shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.ap_shipments (id) on delete cascade,
  kind public.ap_shipment_doc_kind not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_name text not null check (char_length(file_name) <= 200),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────── انتقالات حالة الطلب المسموحة ─────────
-- actor: admin (orders.manage_all)، supplier (منشأة المورد المختار)، customer، system (من الدفع والشحنة).
create table public.ap_order_transitions (
  from_status public.ap_order_status not null,
  to_status public.ap_order_status not null,
  actor text not null check (actor in ('admin', 'supplier', 'customer', 'system')),
  primary key (from_status, to_status, actor)
);
insert into public.ap_order_transitions (from_status, to_status, actor) values
  ('awaiting_payment', 'cancelled', 'admin'),
  ('awaiting_payment', 'paid', 'system'),
  ('paid', 'processing', 'admin'), ('paid', 'processing', 'supplier'), ('paid', 'cancelled', 'admin'),
  ('processing', 'ready_to_ship', 'admin'), ('processing', 'ready_to_ship', 'supplier'), ('processing', 'cancelled', 'admin'),
  ('ready_to_ship', 'processing', 'admin'), ('ready_to_ship', 'processing', 'supplier'),
  ('ready_to_ship', 'shipped', 'system'), ('ready_to_ship', 'in_transit', 'system'),
  ('ready_to_ship', 'customs_clearance', 'system'), ('ready_to_ship', 'out_for_delivery', 'system'), ('ready_to_ship', 'delivered', 'system'),
  ('shipped', 'in_transit', 'system'), ('shipped', 'customs_clearance', 'system'), ('shipped', 'out_for_delivery', 'system'), ('shipped', 'delivered', 'system'),
  ('in_transit', 'customs_clearance', 'system'), ('in_transit', 'out_for_delivery', 'system'), ('in_transit', 'delivered', 'system'),
  ('customs_clearance', 'in_transit', 'system'), ('customs_clearance', 'out_for_delivery', 'system'), ('customs_clearance', 'delivered', 'system'),
  ('out_for_delivery', 'delivered', 'system'),
  -- فشل الشحنة أو إرجاعها يعيد الطلب لجاهز للشحن لإعادة الإسناد.
  ('shipped', 'ready_to_ship', 'system'), ('in_transit', 'ready_to_ship', 'system'), ('customs_clearance', 'ready_to_ship', 'system'),
  ('out_for_delivery', 'ready_to_ship', 'system'),
  ('delivered', 'completed', 'customer'), ('delivered', 'completed', 'admin'),
  ('delivered', 'disputed', 'customer'), ('delivered', 'disputed', 'admin'), ('disputed', 'completed', 'admin');

create trigger ap_carrier_services_touch before update on public.ap_carrier_services for each row execute function ap_private.touch_updated_at();
create trigger ap_shipping_quotes_touch before update on public.ap_shipping_quotes for each row execute function ap_private.touch_updated_at();
create trigger ap_shipments_touch before update on public.ap_shipments for each row execute function ap_private.touch_updated_at();
create trigger ap_carrier_services_audit after insert or update or delete on public.ap_carrier_services for each row execute function ap_private.audit_row();
create trigger ap_shipping_quotes_audit after insert or update or delete on public.ap_shipping_quotes for each row execute function ap_private.audit_row();
create trigger ap_shipments_audit after insert or update or delete on public.ap_shipments for each row execute function ap_private.audit_row();
create trigger ap_payments_audit after insert or update or delete on public.ap_payments for each row execute function ap_private.audit_row();
create trigger ap_shipment_documents_audit after insert or update or delete on public.ap_shipment_documents for each row execute function ap_private.audit_row();

-- ───────── مساعدات ─────────
create or replace function ap_private.carrier_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select org is not null and ap_private.is_org_member(org) and ap_private.org_can(org, 'carrier') $$;

-- من يرى الشحنة: إدارة الشحن/الطلبات، أو الناقل المسند، أو العميل صاحب الطلب.
create or replace function ap_private.shipment_visible(p_shipment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ap_shipments s join public.ap_orders o on o.id = s.order_id
    where s.id = p_shipment and (ap_private.has_permission('shipping.manage') or ap_private.has_permission('orders.manage_all')
      or ap_private.carrier_member(s.carrier_id) or (o.customer_id = auth.uid() and ap_private.is_active_user(auth.uid())))) $$;

create or replace function ap_private.set_order_status(p_order uuid, p_to public.ap_order_status, p_actor text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from public.ap_order_status; v_customer uuid; v_ref text;
begin
  select status, customer_id, reference into v_from, v_customer, v_ref from public.ap_orders where id = p_order for update;
  if not found then raise exception 'ap: order not found' using errcode = 'P0002'; end if;
  if v_from = p_to then return; end if;
  if p_to = 'processing' and exists (select 1 from public.ap_shipments where order_id = p_order
                                     and status not in ('cancelled', 'failed', 'returned', 'delivered')) then
    raise exception 'ap: shipment in progress' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ap_order_transitions where from_status = v_from and to_status = p_to and actor = p_actor) then
    raise exception 'ap: transition not allowed' using errcode = 'P0001';
  end if;
  update public.ap_orders set status = p_to where id = p_order;
  insert into public.ap_order_status_history (order_id, from_status, to_status, note, changed_by)
    values (p_order, v_from, p_to, nullif(btrim(p_note), ''), auth.uid());
  perform ap_private.notify(v_customer, 'order_status', jsonb_build_object('order_id', p_order, 'reference', v_ref, 'status', p_to));
end $$;

-- عند إنشاء الطلب: يُربط بمنشأة المورد المختار وعرض الشحن المعتمد في التسعيرة.
create or replace function ap_private.order_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select sq.organization_id, cq.shipping_quote_id into new.supplier_org_id, new.shipping_quote_id
  from public.ap_customer_quotes cq left join public.ap_supplier_quotes sq on sq.id = cq.supplier_quote_id
  where cq.id = new.customer_quote_id;
  return new;
end $$;
create trigger ap_orders_links before insert on public.ap_orders for each row execute function ap_private.order_links();

-- لا يُحتسب الشحن مرتين: عند الإصدار، بند واحد كحد أقصى لكل من الشحن الدولي والمحلي.
create or replace function ap_private.guard_quote_issue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'issued' and old.status = 'draft' and exists (
    select 1 from public.ap_customer_quote_lines where quote_id = new.id and code in ('international_shipping', 'local_shipping')
    group by code having count(*) > 1) then
    raise exception 'ap: shipping counted twice' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger ap_customer_quotes_guard_issue before update on public.ap_customer_quotes for each row execute function ap_private.guard_quote_issue();

-- ───────── الصلاحيات و RLS ─────────
revoke all on public.ap_carrier_services, public.ap_shipping_quotes, public.ap_payments, public.ap_shipments,
  public.ap_shipment_events, public.ap_shipment_documents, public.ap_order_transitions from anon, authenticated;
revoke all on sequence public.ap_shipment_ref_seq from anon, authenticated;
grant select on public.ap_carrier_services, public.ap_shipping_quotes, public.ap_payments, public.ap_shipments,
  public.ap_shipment_events, public.ap_shipment_documents, public.ap_order_transitions to authenticated;

alter table public.ap_carrier_services enable row level security;
alter table public.ap_shipping_quotes enable row level security;
alter table public.ap_payments enable row level security;
alter table public.ap_shipments enable row level security;
alter table public.ap_shipment_events enable row level security;
alter table public.ap_shipment_documents enable row level security;
alter table public.ap_order_transitions enable row level security;

create policy ap_carrier_services_read on public.ap_carrier_services for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_staff());
-- الناقل يرى عروضه فقط (بلا بيانات الطلب)؛ الإدارة ترى الكل.
create policy ap_shipping_quotes_read on public.ap_shipping_quotes for select to authenticated
  using (ap_private.has_permission('shipping.manage') or ap_private.has_permission('quotes.manage') or ap_private.carrier_member(carrier_id));
create policy ap_payments_read on public.ap_payments for select to authenticated
  using (ap_private.has_permission('finance.manage') or ap_private.has_permission('orders.manage_all')
         or exists (select 1 from public.ap_orders o where o.id = order_id and o.customer_id = (select auth.uid())));
create policy ap_shipments_read on public.ap_shipments for select to authenticated using (ap_private.shipment_visible(id));
create policy ap_shipment_events_read on public.ap_shipment_events for select to authenticated using (ap_private.shipment_visible(shipment_id));
-- العميل يرى إثبات التسليم والفاتورة فقط.
create policy ap_shipment_documents_read on public.ap_shipment_documents for select to authenticated
  using (ap_private.shipment_visible(shipment_id) and (kind in ('proof_of_delivery', 'invoice') or exists (
    select 1 from public.ap_shipments s where s.id = shipment_id
    and (ap_private.has_permission('shipping.manage') or ap_private.has_permission('orders.manage_all') or ap_private.carrier_member(s.carrier_id)))));
-- المالية تقرأ الطلبات لتسجيل الدفعات.
drop policy ap_orders_read on public.ap_orders;
create policy ap_orders_read on public.ap_orders for select to authenticated
  using (customer_id = (select auth.uid()) or ap_private.has_permission('orders.manage_all') or ap_private.has_permission('quotes.manage')
         or ap_private.has_permission('finance.manage'));
create policy ap_order_transitions_read on public.ap_order_transitions for select to authenticated using (true);

-- مستندات الشحنة في مستودع خاص. المسار: <shipment_id>/<uuid>.<ext>. القراءة بروابط مؤقتة عبر الخادم.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ap-shipment-docs', 'ap-shipment-docs', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy ap_shipment_docs_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'ap-shipment-docs' and ap_private.shipment_visible(((storage.foldername(name))[1])::uuid));
create policy ap_shipment_docs_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ap-shipment-docs' and exists (select 1 from public.ap_shipments s
    where s.id = ((storage.foldername(name))[1])::uuid and s.status not in ('cancelled', 'returned')
      and (ap_private.has_permission('shipping.manage') or ap_private.carrier_member(s.carrier_id))));

-- ───────── دوال الناقل: الخدمات ─────────
create or replace function public.ap_save_carrier_service(p_id uuid, p_org uuid, p_name text, p_mode public.ap_shipping_mode,
  p_origins text[], p_destinations text[], p_days_min int, p_days_max int, p_notes text, p_enabled boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid := p_org;
begin
  if p_id is not null then select organization_id into v_org from public.ap_carrier_services where id = p_id; end if;
  if not ap_private.carrier_member(v_org) then raise exception 'ap: organization not approved as carrier' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_origins, '{}') || coalesce(p_destinations, '{}')) c where c !~ '^[A-Z]{2}$') then
    raise exception 'ap: invalid country' using errcode = '22023';
  end if;
  if p_days_min is not null and p_days_max is not null and p_days_max < p_days_min then
    raise exception 'ap: invalid transit days' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ap_carrier_services (organization_id, name, mode, origin_countries, destination_countries,
      transit_days_min, transit_days_max, notes, enabled)
    values (v_org, btrim(p_name), p_mode, coalesce(p_origins, '{}'), coalesce(p_destinations, '{}'), p_days_min, p_days_max,
      nullif(btrim(p_notes), ''), coalesce(p_enabled, true)) returning id into v_id;
  else
    update public.ap_carrier_services set name = btrim(p_name), mode = p_mode, origin_countries = coalesce(p_origins, '{}'),
      destination_countries = coalesce(p_destinations, '{}'), transit_days_min = p_days_min, transit_days_max = p_days_max,
      notes = nullif(btrim(p_notes), ''), enabled = coalesce(p_enabled, true)
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- ───────── عروض الشحن ─────────
-- الإدارة تطلب عرض شحن من ناقل معتمد ببيانات الطرد، أو تُدخل عرضًا يدويًا من ناقل خارجي.
create or replace function public.ap_admin_request_shipping_quote(p_request uuid, p_carrier uuid, p_mode public.ap_shipping_mode,
  p_origin_country text, p_origin_city text, p_destination_city text, p_pieces int, p_weight_kg numeric,
  p_volumetric_kg numeric default null, p_length_cm numeric default null, p_width_cm numeric default null,
  p_height_cm numeric default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r public.ap_quote_requests;
begin
  if not ap_private.has_permission('shipping.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into r from public.ap_quote_requests where id = p_request;
  if not found or r.status not in ('submitted', 'reviewing', 'sourcing', 'quoted') then raise exception 'ap: request closed' using errcode = 'P0001'; end if;
  if not ap_private.org_can(p_carrier, 'carrier') then raise exception 'ap: organization not approved as carrier' using errcode = '22023'; end if;
  insert into public.ap_shipping_quotes (request_id, carrier_id, mode, origin_country, origin_city, destination_city, pieces, weight_kg,
    volumetric_weight_kg, length_cm, width_cm, height_cm, pricing_source, status, notes, requested_by)
  values (p_request, p_carrier, p_mode, upper(p_origin_country), nullif(btrim(p_origin_city), ''), coalesce(nullif(btrim(p_destination_city), ''), r.city),
    coalesce(p_pieces, 1), p_weight_kg, p_volumetric_kg, p_length_cm, p_width_cm, p_height_cm, 'carrier_portal', 'requested',
    nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  perform ap_private.notify(m.user_id, 'shipping_quote_requested', jsonb_build_object('shipping_quote_id', v_id))
    from public.ap_organization_members m where m.organization_id = p_carrier and m.status = 'active';
  return v_id;
end $$;

create or replace function public.ap_admin_add_shipping_quote(p_request uuid, p_carrier_name text, p_mode public.ap_shipping_mode,
  p_origin_country text, p_origin_city text, p_destination_city text, p_pieces int, p_weight_kg numeric, p_volumetric_kg numeric,
  p_price numeric, p_currency text, p_days int, p_valid_until timestamptz, p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r public.ap_quote_requests;
begin
  if not ap_private.has_permission('shipping.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into r from public.ap_quote_requests where id = p_request;
  if not found or r.status not in ('submitted', 'reviewing', 'sourcing', 'quoted') then raise exception 'ap: request closed' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_carrier_name), '') = '' then raise exception 'ap: carrier required' using errcode = '22023'; end if;
  if p_valid_until is null or p_valid_until <= now() then raise exception 'ap: validity required' using errcode = '22023'; end if;
  insert into public.ap_shipping_quotes (request_id, carrier_name, mode, origin_country, origin_city, destination_city, pieces, weight_kg,
    volumetric_weight_kg, price, currency, delivery_estimate_days, valid_until, provider_quote_reference, pricing_source, status, notes,
    requested_by, submitted_by)
  values (p_request, btrim(p_carrier_name), p_mode, upper(p_origin_country), nullif(btrim(p_origin_city), ''),
    coalesce(nullif(btrim(p_destination_city), ''), r.city), coalesce(p_pieces, 1), p_weight_kg, p_volumetric_kg, p_price, upper(p_currency),
    p_days, p_valid_until, nullif(btrim(p_reference), ''), 'admin_manual', 'submitted', nullif(btrim(p_notes), ''), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- عروض الشحن المطلوبة من منشآت الناقل: بيانات الطرد والمسار ووصف القطعة فقط (لا عميل ولا مورد ولا أسعار قطع).
create or replace function public.ap_carrier_shipping_quotes(p_quote uuid default null)
returns table (id uuid, carrier_id uuid, request_reference text, part_description text, mode public.ap_shipping_mode,
  origin_country text, origin_city text, destination_country text, destination_city text, pieces int, weight_kg numeric,
  volumetric_weight_kg numeric, length_cm numeric, width_cm numeric, height_cm numeric, price numeric, currency text,
  delivery_estimate_days int, valid_until timestamptz, provider_quote_reference text, status public.ap_shipping_quote_status,
  notes text, created_at timestamptz, request_open boolean)
language sql stable security definer set search_path = '' as $$
  select q.id, q.carrier_id, r.reference, left(r.description, 300), q.mode, q.origin_country::text, q.origin_city, q.destination_country::text,
    q.destination_city, q.pieces, q.weight_kg, q.volumetric_weight_kg, q.length_cm, q.width_cm, q.height_cm, q.price, q.currency::text,
    q.delivery_estimate_days, q.valid_until, q.provider_quote_reference, q.status, q.notes, q.created_at,
    r.status in ('submitted', 'reviewing', 'sourcing', 'quoted')
  from public.ap_shipping_quotes q join public.ap_quote_requests r on r.id = q.request_id
  where ap_private.carrier_member(q.carrier_id) and (p_quote is null or q.id = p_quote)
  order by q.created_at desc limit 200
$$;

create or replace function public.ap_carrier_submit_shipping_quote(p_quote uuid, p_price numeric, p_currency text, p_days int,
  p_valid_until timestamptz, p_reference text default null, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.ap_shipping_quotes;
begin
  select * into q from public.ap_shipping_quotes where id = p_quote for update;
  if not found or not ap_private.carrier_member(q.carrier_id) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if q.status not in ('requested', 'submitted', 'withdrawn') then raise exception 'ap: quote locked' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ap_quote_requests r where r.id = q.request_id and r.status in ('submitted', 'reviewing', 'sourcing', 'quoted')) then
    raise exception 'ap: request closed' using errcode = 'P0001';
  end if;
  if p_price is null or p_price <= 0 then raise exception 'ap: price required' using errcode = '22023'; end if;
  if p_valid_until is null or p_valid_until <= now() then raise exception 'ap: validity required' using errcode = '22023'; end if;
  update public.ap_shipping_quotes set price = p_price, currency = upper(p_currency), delivery_estimate_days = p_days,
    valid_until = p_valid_until, provider_quote_reference = nullif(btrim(p_reference), ''),
    notes = coalesce(nullif(btrim(p_notes), ''), notes), status = 'submitted', submitted_by = auth.uid()
  where id = p_quote;
end $$;

create or replace function public.ap_carrier_withdraw_shipping_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_carrier uuid;
begin
  select carrier_id into v_carrier from public.ap_shipping_quotes where id = p_quote;
  if not ap_private.carrier_member(v_carrier) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_shipping_quotes set status = 'withdrawn' where id = p_quote and status = 'submitted';
  if not found then raise exception 'ap: quote locked' using errcode = 'P0001'; end if;
end $$;

-- اعتماد عرض شحن في مسودة التسعيرة: يستبدل بند الشحن الدولي (لا ازدواج). عرض بعملة غير عملة التسعيرة
-- يحتاج مبلغًا محوّلًا ومصدر تحويل موثقًا.
create or replace function public.ap_admin_apply_shipping_quote(p_shipping_quote uuid, p_customer_quote uuid,
  p_amount numeric default null, p_fx_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare sq public.ap_shipping_quotes; cq public.ap_customer_quotes; v_amount numeric; v_source text;
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into cq from public.ap_customer_quotes where id = p_customer_quote for update;
  if not found or cq.status <> 'draft' then raise exception 'ap: quote not editable' using errcode = 'P0001'; end if;
  select * into sq from public.ap_shipping_quotes where id = p_shipping_quote for update;
  if not found or sq.request_id <> cq.request_id or sq.status not in ('submitted', 'selected') or sq.valid_until <= now() then
    raise exception 'ap: shipping quote not usable' using errcode = '22023';
  end if;
  if sq.currency = cq.currency then
    v_amount := sq.price; v_source := 'shipping_quote';
  else
    if p_amount is null or p_amount <= 0 or coalesce(btrim(p_fx_note), '') = '' then
      raise exception 'ap: conversion required' using errcode = '22023';
    end if;
    v_amount := round(p_amount, 2);
    v_source := left('shipping_quote ' || sq.price::text || ' ' || sq.currency || ' · ' || btrim(p_fx_note), 200);
  end if;
  delete from public.ap_customer_quote_lines where quote_id = cq.id and code = 'international_shipping';
  insert into public.ap_customer_quote_lines (quote_id, code, description, quantity, unit_amount, status, source, beneficiary, valid_until, sort_order)
    values (cq.id, 'international_shipping', sq.provider_quote_reference, 1, v_amount, 'confirmed', v_source,
      coalesce(sq.carrier_name, (select coalesce(o.trade_name, o.legal_name) from public.ap_organizations o where o.id = sq.carrier_id)),
      sq.valid_until, 1);
  update public.ap_shipping_quotes set status = 'submitted' where request_id = sq.request_id and status = 'selected' and id <> sq.id;
  update public.ap_shipping_quotes set status = 'selected' where id = sq.id;
  update public.ap_customer_quotes set shipping_quote_id = sq.id where id = cq.id;
end $$;

-- ───────── الطلبات: الدفع والحالة ─────────
-- المالية تسجّل دفعة استلمها البائع المسؤول خارج المنصة. المبلغ والعملة يطابقان إجمالي الطلب (لا دفع جزئي).
create or replace function public.ap_finance_record_payment(p_order uuid, p_amount numeric, p_currency text, p_method text,
  p_reference text, p_received_by text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.ap_orders; v_id uuid;
begin
  if not ap_private.has_permission('finance.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into o from public.ap_orders where id = p_order for update;
  if not found then raise exception 'ap: order not found' using errcode = 'P0002'; end if;
  if o.status <> 'awaiting_payment' or o.payment_status <> 'unpaid' then raise exception 'ap: order not awaiting payment' using errcode = 'P0001'; end if;
  if p_amount is distinct from o.total or upper(p_currency) <> o.currency then
    raise exception 'ap: amount must match order total' using errcode = '22023';
  end if;
  insert into public.ap_payments (order_id, amount, currency, method, reference, received_by, note, recorded_by)
    values (p_order, p_amount, o.currency, p_method, btrim(p_reference), btrim(p_received_by), nullif(btrim(p_note), ''), auth.uid())
    returning id into v_id;
  update public.ap_orders set payment_status = 'paid' where id = p_order;
  perform ap_private.set_order_status(p_order, 'paid', 'system', 'payment ' || btrim(p_reference));
  return v_id;
end $$;

create or replace function public.ap_admin_set_order_status(p_order uuid, p_status public.ap_order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('orders.manage_all') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_status = 'cancelled' and coalesce(btrim(p_note), '') = '' then raise exception 'ap: reason required' using errcode = '22023'; end if;
  perform ap_private.set_order_status(p_order, p_status, 'admin', p_note);
end $$;

-- طلبات المورد المختار: بنود القطعة فقط (لا بيانات العميل ولا بقية التكاليف).
create or replace function public.ap_supplier_orders(p_order uuid default null)
returns table (id uuid, reference text, status public.ap_order_status, payment_status text, created_at timestamptz,
  supplier_org_id uuid, request_reference text, description text, part_number text, quantity int, city text,
  part_unit_price numeric, part_currency text, part_type public.ap_part_type)
language sql stable security definer set search_path = '' as $$
  select o.id, o.reference, o.status, o.payment_status, o.created_at, o.supplier_org_id, r.reference, r.description, r.part_number,
    r.quantity, r.city, sq.unit_price, sq.currency::text, sq.part_type
  from public.ap_orders o
  join public.ap_quote_requests r on r.id = o.request_id
  join public.ap_customer_quotes cq on cq.id = o.customer_quote_id
  left join public.ap_supplier_quotes sq on sq.id = cq.supplier_quote_id
  where o.supplier_org_id is not null and ap_private.is_org_member(o.supplier_org_id) and ap_private.org_can_sell(o.supplier_org_id)
    and (p_order is null or o.id = p_order)
  order by o.created_at desc limit 200
$$;

create or replace function public.ap_supplier_set_order_status(p_order uuid, p_status public.ap_order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select supplier_org_id into v_org from public.ap_orders where id = p_order;
  if v_org is null or not (ap_private.is_org_member(v_org) and ap_private.org_can_sell(v_org)) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  perform ap_private.set_order_status(p_order, p_status, 'supplier', p_note);
end $$;

create or replace function public.ap_customer_confirm_delivery(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ap_orders where id = p_order and customer_id = auth.uid()) or not ap_private.is_active_user(auth.uid()) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  perform ap_private.set_order_status(p_order, 'completed', 'customer', null);
end $$;

-- ───────── الشحنات ─────────
-- لا شحن قبل تسجيل الدفع وجاهزية الطلب. بيانات الطرد من عرض الشحن المعتمد إن وُجد.
create or replace function public.ap_admin_create_shipment(p_order uuid, p_shipping_quote uuid, p_carrier uuid, p_carrier_name text,
  p_mode public.ap_shipping_mode, p_pieces int, p_weight_kg numeric, p_volumetric_kg numeric, p_recipient_name text,
  p_recipient_phone text, p_destination_city text, p_destination_address text, p_estimated_days int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.ap_orders; sq public.ap_shipping_quotes; v_id uuid; v_carrier uuid := p_carrier; v_name text := nullif(btrim(p_carrier_name), '');
begin
  if not ap_private.has_permission('shipping.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into o from public.ap_orders where id = p_order for update;
  if not found then raise exception 'ap: order not found' using errcode = 'P0002'; end if;
  if o.payment_status <> 'paid' or o.status <> 'ready_to_ship' then raise exception 'ap: order not ready to ship' using errcode = 'P0001'; end if;
  if p_shipping_quote is not null then
    select * into sq from public.ap_shipping_quotes where id = p_shipping_quote;
    if not found or sq.request_id <> o.request_id then raise exception 'ap: shipping quote not usable' using errcode = '22023'; end if;
    v_carrier := coalesce(v_carrier, sq.carrier_id); v_name := coalesce(v_name, sq.carrier_name);
  end if;
  if v_carrier is not null and not ap_private.org_can(v_carrier, 'carrier') then
    raise exception 'ap: organization not approved as carrier' using errcode = '22023';
  end if;
  if v_carrier is null and v_name is null then raise exception 'ap: carrier required' using errcode = '22023'; end if;
  insert into public.ap_shipments (order_id, shipping_quote_id, carrier_id, carrier_name, mode, pieces, weight_kg, volumetric_weight_kg,
    origin_country, recipient_name, recipient_phone, destination_city, destination_address, estimated_delivery_at, created_by)
  values (p_order, p_shipping_quote, v_carrier, v_name, coalesce(p_mode, sq.mode, 'air'), coalesce(p_pieces, sq.pieces, 1),
    coalesce(p_weight_kg, sq.weight_kg), coalesce(p_volumetric_kg, sq.volumetric_weight_kg), sq.origin_country,
    btrim(p_recipient_name), btrim(p_recipient_phone), btrim(p_destination_city), btrim(p_destination_address),
    case when coalesce(p_estimated_days, sq.delivery_estimate_days) is not null
         then now() + make_interval(days => coalesce(p_estimated_days, sq.delivery_estimate_days)) end, auth.uid())
  returning id into v_id;
  insert into public.ap_shipment_events (shipment_id, status, source, recorded_by) values (v_id, 'assigned', 'admin', auth.uid());
  if v_carrier is not null then
    perform ap_private.notify(m.user_id, 'shipment_assigned', jsonb_build_object('shipment_id', v_id))
      from public.ap_organization_members m where m.organization_id = v_carrier and m.status = 'active';
  end if;
  return v_id;
end $$;

-- تحديث مرحلة الشحنة (الناقل المسند أو إدارة الشحن). المسار يتقدم فقط؛ رقم التتبع إلزامي من الاستلام فصاعدًا؛
-- الناقل يحتاج إثبات تسليم مرفوعًا قبل «تم التسليم». حالة الطلب تتبع الشحنة تلقائيًا.
create or replace function public.ap_update_shipment(p_shipment uuid, p_status public.ap_shipment_status, p_tracking text default null,
  p_location text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.ap_shipments; v_source text; v_rank int; v_new_rank int; v_tracking text;
  v_path public.ap_shipment_status[] := array['assigned', 'accepted', 'picked_up', 'in_transit', 'customs_clearance', 'out_for_delivery', 'delivered']::public.ap_shipment_status[];
  v_order_status public.ap_order_status;
begin
  select * into s from public.ap_shipments where id = p_shipment for update;
  if not found then raise exception 'ap: shipment not found' using errcode = 'P0002'; end if;
  if ap_private.carrier_member(s.carrier_id) then v_source := 'carrier';
  elsif ap_private.has_permission('shipping.manage') then v_source := 'admin';
  else raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if s.status in ('delivered', 'cancelled', 'returned', 'failed') then raise exception 'ap: shipment closed' using errcode = 'P0001'; end if;
  if p_status = 'cancelled' and (v_source <> 'admin' or s.status not in ('assigned', 'accepted')) then
    raise exception 'ap: transition not allowed' using errcode = 'P0001';
  end if;
  v_rank := array_position(v_path, s.status);
  v_new_rank := array_position(v_path, p_status);
  if v_new_rank is not null and v_new_rank <= v_rank and not (p_status = 'in_transit' and s.status = 'customs_clearance') then
    raise exception 'ap: transition not allowed' using errcode = 'P0001';
  end if;
  v_tracking := coalesce(nullif(btrim(p_tracking), ''), s.tracking_number);
  if (v_new_rank is not null and v_new_rank >= 3) and v_tracking is null then raise exception 'ap: tracking required' using errcode = '22023'; end if;
  if p_status = 'delivered' and v_source = 'carrier'
     and not exists (select 1 from public.ap_shipment_documents where shipment_id = s.id and kind = 'proof_of_delivery') then
    raise exception 'ap: proof of delivery required' using errcode = '22023';
  end if;

  update public.ap_shipments set status = p_status, tracking_number = v_tracking,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = s.id;
  insert into public.ap_shipment_events (shipment_id, status, location, note, source, recorded_by)
    values (s.id, p_status, nullif(btrim(p_location), ''), nullif(btrim(p_note), ''), v_source, auth.uid());

  v_order_status := case p_status
    when 'picked_up' then 'shipped' when 'in_transit' then 'in_transit' when 'customs_clearance' then 'customs_clearance'
    when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
    when 'failed' then 'ready_to_ship' when 'returned' then 'ready_to_ship' end;
  if v_order_status is not null and (select status from public.ap_orders where id = s.order_id) <> v_order_status then
    perform ap_private.set_order_status(s.order_id, v_order_status, 'system', s.reference || ' ' || p_status::text);
  end if;
end $$;

create or replace function public.ap_add_shipment_document(p_shipment uuid, p_kind public.ap_shipment_doc_kind, p_path text,
  p_mime text, p_file_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.ap_shipments; v_id uuid;
begin
  select * into s from public.ap_shipments where id = p_shipment;
  if not found or not (ap_private.carrier_member(s.carrier_id) or ap_private.has_permission('shipping.manage')) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 1) <> p_shipment::text
     or not exists (select 1 from storage.objects where bucket_id = 'ap-shipment-docs' and name = p_path) then
    raise exception 'ap: invalid document path' using errcode = '22023';
  end if;
  insert into public.ap_shipment_documents (shipment_id, kind, storage_path, mime_type, file_name, uploaded_by)
    values (p_shipment, p_kind, p_path, p_mime, left(p_file_name, 200), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_log_shipment_document_access(p_doc uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.ap_shipment_documents;
begin
  -- القراءة عبر RLS: العميل لا يصل لغير إثبات التسليم والفاتورة.
  select * into d from public.ap_shipment_documents where id = p_doc;
  if not found or not ap_private.shipment_visible(d.shipment_id) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if d.kind not in ('proof_of_delivery', 'invoice') and not exists (select 1 from public.ap_shipments s where s.id = d.shipment_id
     and (ap_private.has_permission('shipping.manage') or ap_private.has_permission('orders.manage_all') or ap_private.carrier_member(s.carrier_id))) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  perform ap_private.log('document_view', 'ap_shipment_documents', p_doc::text, null, '{}'::jsonb);
  return d.storage_path;
end $$;

-- ───────── التقارير ─────────
-- إجمالي قيمة الطلبات منفصل عن إيراد رسوم الخدمة وصافيها بعد الخصومات. لا تُجمع عملات مختلفة.
create or replace function public.ap_report_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := (p_from::timestamp at time zone 'Asia/Riyadh'); v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Riyadh');
  v jsonb;
begin
  if not ap_private.has_permission('reports.read') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then raise exception 'ap: invalid range' using errcode = '22023'; end if;
  with req as (select * from public.ap_quote_requests where created_at >= v_from and created_at < v_to),
  ord as (select * from public.ap_orders where created_at >= v_from and created_at < v_to),
  live as (select * from ord where status not in ('cancelled', 'refunded')),
  lines as (select o.currency, i.code, sum(i.amount) as amount from live o join public.ap_order_items i on i.order_id = o.id group by o.currency, i.code),
  money as (
    select l.currency,
      (select sum(total) from live x where x.currency = l.currency) as gmv,
      coalesce(sum(l.amount) filter (where l.code = 'service_fee'), 0) as service_fee,
      coalesce(sum(l.amount) filter (where l.code = 'discount'), 0) as discounts
    from lines l group by l.currency)
  select jsonb_build_object(
    'requests', (select count(*) from req),
    'requests_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from req group by status) t), '{}'::jsonb),
    'quoted_requests', (select count(*) from req r where exists (select 1 from public.ap_customer_quotes q where q.request_id = r.id and q.issued_at is not null)),
    'accepted_requests', (select count(*) from req where status = 'accepted'),
    'avg_hours_to_quote', (select round(avg(extract(epoch from (q.first_issue - r.created_at)) / 3600)::numeric, 1)
       from req r join (select request_id, min(issued_at) first_issue from public.ap_customer_quotes where issued_at is not null group by request_id) q on q.request_id = r.id),
    'orders', (select count(*) from ord),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from ord group by status) t), '{}'::jsonb),
    'paid_orders', (select count(*) from ord where payment_status = 'paid'),
    'money', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'gmv', gmv, 'service_fee', service_fee,
       'discounts', discounts, 'net_service_income', service_fee + discounts)) from money), '[]'::jsonb),
    'shipments_active', (select count(*) from public.ap_shipments where status not in ('delivered', 'cancelled', 'returned', 'failed')),
    'shipments_late', (select count(*) from public.ap_shipments where status not in ('delivered', 'cancelled', 'returned', 'failed')
       and estimated_delivery_at < now()),
    'shipments_delivered', (select count(*) from public.ap_shipments where delivered_at >= v_from and delivered_at < v_to)
  ) into v;
  return v;
end $$;

-- صفوف الطلبات للتصدير (CSV) بلا بيانات شخصية.
create or replace function public.ap_report_orders(p_from date, p_to date)
returns table (reference text, created_at timestamptz, status public.ap_order_status, payment_status text, currency text, total numeric,
  part_amount numeric, shipping_amount numeric, customs_tax_amount numeric, service_fee numeric, discount numeric, city text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('reports.read') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then raise exception 'ap: invalid range' using errcode = '22023'; end if;
  return query
  select o.reference, o.created_at, o.status, o.payment_status, o.currency::text, o.total,
    coalesce(sum(i.amount) filter (where i.code = 'part'), 0),
    coalesce(sum(i.amount) filter (where i.code in ('international_shipping', 'local_shipping')), 0),
    coalesce(sum(i.amount) filter (where i.code in ('customs', 'tax')), 0),
    coalesce(sum(i.amount) filter (where i.code = 'service_fee'), 0),
    coalesce(sum(i.amount) filter (where i.code = 'discount'), 0),
    r.city
  from public.ap_orders o join public.ap_quote_requests r on r.id = o.request_id
  left join public.ap_order_items i on i.order_id = o.id
  where o.created_at >= (p_from::timestamp at time zone 'Asia/Riyadh') and o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Riyadh')
  group by o.id, r.city
  order by o.created_at;
end $$;

revoke all on function public.ap_save_carrier_service(uuid, uuid, text, public.ap_shipping_mode, text[], text[], int, int, text, boolean),
  public.ap_admin_request_shipping_quote(uuid, uuid, public.ap_shipping_mode, text, text, text, int, numeric, numeric, numeric, numeric, numeric, text),
  public.ap_admin_add_shipping_quote(uuid, text, public.ap_shipping_mode, text, text, text, int, numeric, numeric, numeric, text, int, timestamptz, text, text),
  public.ap_carrier_shipping_quotes(uuid), public.ap_carrier_submit_shipping_quote(uuid, numeric, text, int, timestamptz, text, text),
  public.ap_carrier_withdraw_shipping_quote(uuid), public.ap_admin_apply_shipping_quote(uuid, uuid, numeric, text),
  public.ap_finance_record_payment(uuid, numeric, text, text, text, text, text),
  public.ap_admin_set_order_status(uuid, public.ap_order_status, text),
  public.ap_supplier_orders(uuid), public.ap_supplier_set_order_status(uuid, public.ap_order_status, text),
  public.ap_customer_confirm_delivery(uuid),
  public.ap_admin_create_shipment(uuid, uuid, uuid, text, public.ap_shipping_mode, int, numeric, numeric, text, text, text, text, int),
  public.ap_update_shipment(uuid, public.ap_shipment_status, text, text, text),
  public.ap_add_shipment_document(uuid, public.ap_shipment_doc_kind, text, text, text), public.ap_log_shipment_document_access(uuid),
  public.ap_report_summary(date, date), public.ap_report_orders(date, date) from public, anon;
grant execute on function public.ap_save_carrier_service(uuid, uuid, text, public.ap_shipping_mode, text[], text[], int, int, text, boolean),
  public.ap_admin_request_shipping_quote(uuid, uuid, public.ap_shipping_mode, text, text, text, int, numeric, numeric, numeric, numeric, numeric, text),
  public.ap_admin_add_shipping_quote(uuid, text, public.ap_shipping_mode, text, text, text, int, numeric, numeric, numeric, text, int, timestamptz, text, text),
  public.ap_carrier_shipping_quotes(uuid), public.ap_carrier_submit_shipping_quote(uuid, numeric, text, int, timestamptz, text, text),
  public.ap_carrier_withdraw_shipping_quote(uuid), public.ap_admin_apply_shipping_quote(uuid, uuid, numeric, text),
  public.ap_finance_record_payment(uuid, numeric, text, text, text, text, text),
  public.ap_admin_set_order_status(uuid, public.ap_order_status, text),
  public.ap_supplier_orders(uuid), public.ap_supplier_set_order_status(uuid, public.ap_order_status, text),
  public.ap_customer_confirm_delivery(uuid),
  public.ap_admin_create_shipment(uuid, uuid, uuid, text, public.ap_shipping_mode, int, numeric, numeric, text, text, text, text, int),
  public.ap_update_shipment(uuid, public.ap_shipment_status, text, text, text),
  public.ap_add_shipment_document(uuid, public.ap_shipment_doc_kind, text, text, text), public.ap_log_shipment_document_access(uuid),
  public.ap_report_summary(date, date), public.ap_report_orders(date, date) to authenticated;

revoke all on function ap_private.carrier_member(uuid), ap_private.shipment_visible(uuid),
  ap_private.set_order_status(uuid, public.ap_order_status, text, text), ap_private.order_links(),
  ap_private.guard_quote_issue() from public;
grant execute on function ap_private.carrier_member(uuid), ap_private.shipment_visible(uuid) to authenticated;
