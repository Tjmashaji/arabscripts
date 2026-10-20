-- المرحلة C (طلبات التسعير والتسعيرة المفصّلة والطلبات): الصقه كاملًا في SQL Editor لمشروع auto-parts ثم Run (مرة واحدة).
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
