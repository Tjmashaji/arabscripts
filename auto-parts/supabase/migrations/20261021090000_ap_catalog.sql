-- المرحلة B2 — الكتالوج: العلامات والموديلات والفئات، تعريف القطعة منفصل عن عروض البائعين، أرقام القطع، التوافق،
-- العروض وتاريخ تأكيد التوفر، صور المنتجات، والبحث العام.
-- القواعد: لا يُنشر منتج قبل اعتماد الإدارة؛ لا يضيف منتجًا أو عرضًا إلا شريك معتمد بصفة بائع أو مورد أو مصنع؛
-- لا يظهر للزائر إلا المنشور والنشط؛ لا يرى شريك عروض منافسيه الداخلية؛ المخزون المجهول null وليس صفرًا.

create extension if not exists pg_trgm with schema extensions;

create type public.ap_product_status as enum ('draft', 'pending_review', 'published', 'rejected', 'suspended');
create type public.ap_part_type as enum ('genuine', 'aftermarket', 'used', 'refurbished');
create type public.ap_identifier_kind as enum ('oem', 'manufacturer', 'supplier', 'alternative');
create type public.ap_availability as enum ('pending_confirmation', 'available', 'out_of_stock', 'on_request');
create type public.ap_offer_status as enum ('draft', 'active', 'paused');

-- ───────── التصنيف ─────────
create table public.ap_vehicle_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null, name_en text not null, name_zh text not null,
  enabled boolean not null default true,
  sort_order int not null default 0
);
insert into public.ap_vehicle_brands (slug, name_ar, name_en, name_zh, sort_order) values
  ('chery', 'شيري', 'Chery', '奇瑞', 1), ('changan', 'شانجان', 'Changan', '长安', 2), ('jetour', 'جيتور', 'Jetour', '捷途', 3),
  ('geely', 'جيلي', 'Geely', '吉利', 4), ('haval', 'هافال', 'Haval', '哈弗', 5);

-- الموديلات يضيفها المدير (لا نضع قائمة موديلات وسنوات غير مؤكدة).
create table public.ap_vehicle_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.ap_vehicle_brands (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  name_ar text check (char_length(name_ar) <= 80),
  year_from int check (year_from between 1990 and 2100),
  year_to int check (year_to between 1990 and 2100),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, name),
  check (year_to is null or year_from is null or year_to >= year_from)
);

create table public.ap_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null, name_en text not null, name_zh text not null,
  sort_order int not null default 0,
  enabled boolean not null default true
);
insert into public.ap_categories (slug, name_ar, name_en, name_zh, sort_order) values
  ('engine', 'المحرك', 'Engine', '发动机', 1), ('filters', 'الفلاتر', 'Filters', '滤清器', 2),
  ('brakes', 'الفرامل', 'Brakes', '制动系统', 3), ('suspension', 'التعليق', 'Suspension', '悬挂', 4),
  ('cooling-ac', 'التبريد والتكييف', 'Cooling & A/C', '冷却与空调', 5), ('electrical', 'الكهرباء', 'Electrical', '电气', 6),
  ('lighting', 'الإضاءة', 'Lighting', '灯具', 7), ('transmission', 'ناقل الحركة', 'Transmission', '变速箱', 8),
  ('body', 'الهيكل والصدامات', 'Body & bumpers', '车身与保险杠', 9), ('interior', 'المقصورة', 'Interior', '内饰', 10);

-- ───────── المنتج (تعريف القطعة) ─────────
create table public.ap_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ap_organizations (id) on delete restrict,
  brand_id uuid not null references public.ap_vehicle_brands (id),
  category_id uuid not null references public.ap_categories (id),
  name text not null check (char_length(name) between 2 and 200),
  description text check (char_length(description) <= 4000),
  original_language text not null default 'ar' references public.ap_locales (code),
  status public.ap_product_status not null default 'draft',
  review_reason text check (char_length(review_reason) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_products_status_idx on public.ap_products (status, brand_id, category_id);
create index ap_products_org_idx on public.ap_products (organization_id);
create index ap_products_name_trgm on public.ap_products using gin (name extensions.gin_trgm_ops);

-- أرقام القطع لا تُترجم. normalized للبحث (أحرف كبيرة بلا مسافات أو شرطات).
create table public.ap_product_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ap_products (id) on delete cascade,
  kind public.ap_identifier_kind not null,
  value text not null check (char_length(value) between 2 and 60),
  normalized text generated always as (upper(regexp_replace(value, '[^0-9A-Za-z]', '', 'g'))) stored,
  unique (product_id, kind, value)
);
create index ap_product_identifiers_norm_idx on public.ap_product_identifiers (normalized text_pattern_ops);

create table public.ap_vehicle_fitments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ap_products (id) on delete cascade,
  model_id uuid not null references public.ap_vehicle_models (id) on delete restrict,
  year_from int check (year_from between 1990 and 2100),
  year_to int check (year_to between 1990 and 2100),
  engine text check (char_length(engine) <= 80),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (year_to is null or year_from is null or year_to >= year_from)
);
create index ap_vehicle_fitments_model_idx on public.ap_vehicle_fitments (model_id, year_from, year_to);
create index ap_vehicle_fitments_product_idx on public.ap_vehicle_fitments (product_id);

-- ───────── عروض البائعين ─────────
create table public.ap_product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ap_products (id) on delete restrict,
  organization_id uuid not null references public.ap_organizations (id) on delete restrict,
  part_type public.ap_part_type not null,
  unit_price numeric(12, 2) check (unit_price is null or unit_price > 0),
  currency char(3) not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  origin_country char(2) check (origin_country ~ '^[A-Z]{2}$'),
  lead_time_days int check (lead_time_days between 0 and 365),
  availability_status public.ap_availability not null default 'pending_confirmation',
  stock_quantity int check (stock_quantity is null or stock_quantity >= 0),
  last_confirmed_at timestamptz,
  valid_until timestamptz,
  status public.ap_offer_status not null default 'draft',
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_product_offers_product_idx on public.ap_product_offers (product_id, status);
create index ap_product_offers_org_idx on public.ap_product_offers (organization_id);

-- كل تأكيد توفر يُحفظ: من أكّد، متى، الكمية (null = غير معروفة).
create table public.ap_inventory_snapshots (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.ap_product_offers (id) on delete cascade,
  availability_status public.ap_availability not null,
  quantity int check (quantity is null or quantity >= 0),
  unit_price numeric(12, 2),
  currency char(3),
  source text not null check (source in ('partner', 'admin')),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now()
);
create index ap_inventory_snapshots_offer_idx on public.ap_inventory_snapshots (offer_id, confirmed_at desc);

create table public.ap_product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ap_products (id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger ap_products_touch before update on public.ap_products for each row execute function ap_private.touch_updated_at();
create trigger ap_product_offers_touch before update on public.ap_product_offers for each row execute function ap_private.touch_updated_at();
create trigger ap_products_audit after insert or update or delete on public.ap_products for each row execute function ap_private.audit_row();
create trigger ap_product_offers_audit after insert or update or delete on public.ap_product_offers for each row execute function ap_private.audit_row();
create trigger ap_vehicle_models_audit after insert or update or delete on public.ap_vehicle_models for each row execute function ap_private.audit_row();

-- ───────── مساعدات ─────────
create or replace function ap_private.org_can_sell(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ap_private.org_can(org, 'seller') or ap_private.org_can(org, 'supplier') or ap_private.org_can(org, 'manufacturer') $$;

create or replace function ap_private.product_editable(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ap_products x
    where x.id = p and (ap_private.has_permission('products.publish')
      or (x.status in ('draft', 'rejected') and ap_private.is_org_member(x.organization_id) and ap_private.org_can_sell(x.organization_id)))) $$;

create or replace function ap_private.availability_max_age() returns interval
language sql stable security definer set search_path = '' as $$
  select make_interval(hours => coalesce((select (value #>> '{}')::int from public.ap_platform_settings where key = 'availability_max_age_hours'), 48)) $$;

-- العرض يظهر للزائر فقط إن كان المنتج منشورًا، والعرض نشطًا وغير منتهٍ، والمنشأة نشطة وما زالت معتمدة للبيع.
create or replace function ap_private.offer_public(o public.ap_product_offers) returns boolean
language sql stable security definer set search_path = '' as $$
  select o.status = 'active' and (o.valid_until is null or o.valid_until > now()) and ap_private.org_can_sell(o.organization_id)
     and exists (select 1 from public.ap_products p where p.id = o.product_id and p.status = 'published') $$;

-- ───────── الصلاحيات و RLS ─────────
revoke all on public.ap_vehicle_brands, public.ap_vehicle_models, public.ap_categories, public.ap_products,
  public.ap_product_identifiers, public.ap_vehicle_fitments, public.ap_product_offers, public.ap_inventory_snapshots,
  public.ap_product_media from anon, authenticated;
grant select on public.ap_vehicle_brands, public.ap_vehicle_models, public.ap_categories, public.ap_products,
  public.ap_product_identifiers, public.ap_vehicle_fitments, public.ap_product_media to anon, authenticated;
grant select on public.ap_product_offers, public.ap_inventory_snapshots to authenticated;

alter table public.ap_vehicle_brands enable row level security;
alter table public.ap_vehicle_models enable row level security;
alter table public.ap_categories enable row level security;
alter table public.ap_products enable row level security;
alter table public.ap_product_identifiers enable row level security;
alter table public.ap_vehicle_fitments enable row level security;
alter table public.ap_product_offers enable row level security;
alter table public.ap_inventory_snapshots enable row level security;
alter table public.ap_product_media enable row level security;

create policy ap_brands_read on public.ap_vehicle_brands for select to anon, authenticated using (enabled or ap_private.is_staff());
create policy ap_models_read on public.ap_vehicle_models for select to anon, authenticated using (enabled or ap_private.is_staff());
create policy ap_categories_read on public.ap_categories for select to anon, authenticated using (enabled or ap_private.is_staff());

create policy ap_products_read on public.ap_products for select to anon, authenticated
  using (status = 'published' or ap_private.is_org_member(organization_id) or ap_private.has_permission('products.publish'));
create policy ap_identifiers_read on public.ap_product_identifiers for select to anon, authenticated
  using (exists (select 1 from public.ap_products p where p.id = product_id));
create policy ap_fitments_read on public.ap_vehicle_fitments for select to anon, authenticated
  using (exists (select 1 from public.ap_products p where p.id = product_id));
create policy ap_media_read on public.ap_product_media for select to anon, authenticated
  using (exists (select 1 from public.ap_products p where p.id = product_id));

-- العروض الكاملة للمنشأة صاحبتها وللإدارة فقط؛ الزائر يرى العروض عبر ap_public_offers.
create policy ap_offers_read on public.ap_product_offers for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.has_permission('products.publish')
         or ap_private.has_permission('availability.confirm'));
create policy ap_snapshots_read on public.ap_inventory_snapshots for select to authenticated
  using (exists (select 1 from public.ap_product_offers o where o.id = offer_id));

-- صور المنتجات علنية (لا تحتوي بيانات خاصة)؛ الرفع لأعضاء المنشأة أثناء التحرير أو للإدارة.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ap-product-media', 'ap-product-media', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy ap_product_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ap-product-media' and ap_private.product_editable(((storage.foldername(name))[1])::uuid));
create policy ap_product_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ap-product-media' and ap_private.product_editable(((storage.foldername(name))[1])::uuid));

-- ───────── دوال الشريك: المنتجات ─────────
create or replace function public.ap_create_product(p_org uuid, p_brand uuid, p_category uuid, p_name text,
  p_description text default null, p_language text default 'ar')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (ap_private.is_org_member(p_org) and ap_private.org_can_sell(p_org)) then
    raise exception 'ap: organization not approved to sell' using errcode = '42501';
  end if;
  insert into public.ap_products (organization_id, brand_id, category_id, name, description, original_language, created_by)
    values (p_org, p_brand, p_category, btrim(p_name), nullif(btrim(p_description), ''),
            coalesce((select code from public.ap_locales where code = p_language), 'ar'), auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_update_product(p_product uuid, p_brand uuid, p_category uuid, p_name text, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.product_editable(p_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  update public.ap_products set brand_id = p_brand, category_id = p_category, name = btrim(p_name),
    description = nullif(btrim(p_description), '') where id = p_product;
end $$;

create or replace function public.ap_set_product_identifiers(p_product uuid, p_identifiers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.product_editable(p_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  delete from public.ap_product_identifiers where product_id = p_product;
  insert into public.ap_product_identifiers (product_id, kind, value)
    select distinct p_product, (e->>'kind')::public.ap_identifier_kind, btrim(e->>'value')
    from jsonb_array_elements(coalesce(p_identifiers, '[]'::jsonb)) e
    where coalesce(btrim(e->>'value'), '') <> '';
end $$;

create or replace function public.ap_add_fitment(p_product uuid, p_model uuid, p_year_from int, p_year_to int,
  p_engine text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not ap_private.product_editable(p_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  insert into public.ap_vehicle_fitments (product_id, model_id, year_from, year_to, engine, notes)
    values (p_product, p_model, p_year_from, p_year_to, nullif(btrim(p_engine), ''), nullif(btrim(p_notes), ''))
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_remove_fitment(p_fitment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_product uuid;
begin
  select product_id into v_product from public.ap_vehicle_fitments where id = p_fitment;
  if v_product is null or not ap_private.product_editable(v_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  delete from public.ap_vehicle_fitments where id = p_fitment;
end $$;

create or replace function public.ap_add_product_media(p_product uuid, p_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not ap_private.product_editable(p_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  if split_part(p_path, '/', 1) <> p_product::text
     or not exists (select 1 from storage.objects where bucket_id = 'ap-product-media' and name = p_path) then
    raise exception 'ap: invalid media path' using errcode = '22023';
  end if;
  if (select count(*) from public.ap_product_media where product_id = p_product) >= 8 then
    raise exception 'ap: too many images' using errcode = 'P0001';
  end if;
  insert into public.ap_product_media (product_id, storage_path, sort_order, uploaded_by)
    values (p_product, p_path, (select count(*) from public.ap_product_media where product_id = p_product), auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_remove_product_media(p_media uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare m public.ap_product_media;
begin
  select * into m from public.ap_product_media where id = p_media;
  if not found or not ap_private.product_editable(m.product_id) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  delete from public.ap_product_media where id = p_media;
  return m.storage_path;
end $$;

-- إرسال المنتج للمراجعة: يحتاج رقم قطعة واحدًا على الأقل.
create or replace function public.ap_submit_product(p_product uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.product_editable(p_product) then raise exception 'ap: product not editable' using errcode = '42501'; end if;
  if not exists (select 1 from public.ap_product_identifiers where product_id = p_product) then
    raise exception 'ap: part number required' using errcode = '22023';
  end if;
  update public.ap_products set status = 'pending_review', review_reason = null
    where id = p_product and status in ('draft', 'rejected');
end $$;

-- ───────── دوال الإدارة: الكتالوج والمراجعة ─────────
create or replace function public.ap_admin_review_product(p_product uuid, p_decision public.ap_product_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('products.publish') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_decision not in ('published', 'rejected', 'suspended') then raise exception 'ap: invalid decision' using errcode = '22023'; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'ap: reason required' using errcode = '22023';
  end if;
  if p_decision = 'published' and not exists (select 1 from public.ap_product_identifiers where product_id = p_product) then
    raise exception 'ap: part number required' using errcode = '22023';
  end if;
  update public.ap_products set status = p_decision, review_reason = nullif(btrim(p_reason), ''),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_product and (p_decision = 'suspended' or status in ('pending_review', 'suspended', 'rejected'));
  if not found then raise exception 'ap: product not reviewable' using errcode = 'P0001'; end if;
end $$;

create or replace function public.ap_admin_upsert_model(p_id uuid, p_brand uuid, p_name text, p_name_ar text,
  p_year_from int, p_year_to int, p_enabled boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not ap_private.has_permission('products.publish') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.ap_vehicle_models (brand_id, name, name_ar, year_from, year_to, enabled)
      values (p_brand, btrim(p_name), nullif(btrim(p_name_ar), ''), p_year_from, p_year_to, p_enabled) returning id into v_id;
  else
    update public.ap_vehicle_models set brand_id = p_brand, name = btrim(p_name), name_ar = nullif(btrim(p_name_ar), ''),
      year_from = p_year_from, year_to = p_year_to, enabled = p_enabled where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- ───────── دوال الشريك: العروض والتوفر ─────────
create or replace function public.ap_save_offer(p_id uuid, p_product uuid, p_org uuid, p_part_type public.ap_part_type,
  p_unit_price numeric, p_currency text, p_origin_country text, p_lead_time_days int, p_valid_until timestamptz,
  p_status public.ap_offer_status, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid := p_org;
begin
  if p_id is not null then select organization_id into v_org from public.ap_product_offers where id = p_id; end if;
  if v_org is null or not (ap_private.is_org_member(v_org) and ap_private.org_can_sell(v_org)) then
    raise exception 'ap: organization not approved to sell' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ap_products p where p.id = p_product
                 and (p.status = 'published' or p.organization_id = v_org)) then
    raise exception 'ap: product not available for offers' using errcode = '42501';
  end if;
  if p_status = 'active' and (p_unit_price is null or p_unit_price <= 0) then
    raise exception 'ap: price required to activate' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ap_product_offers (product_id, organization_id, part_type, unit_price, currency, origin_country,
      lead_time_days, valid_until, status, notes, created_by)
    values (p_product, v_org, p_part_type, p_unit_price, upper(p_currency), upper(nullif(btrim(p_origin_country), '')),
      p_lead_time_days, p_valid_until, p_status, nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    -- تغيير السعر أو العملة يُسقط تأكيد التوفر السابق: التأكيد كان على سعر مختلف.
    update public.ap_product_offers set part_type = p_part_type,
      last_confirmed_at = case when unit_price is distinct from p_unit_price or currency <> upper(p_currency) then null else last_confirmed_at end,
      availability_status = case when unit_price is distinct from p_unit_price or currency <> upper(p_currency)
                                 then 'pending_confirmation'::public.ap_availability else availability_status end,
      unit_price = p_unit_price, currency = upper(p_currency), origin_country = upper(nullif(btrim(p_origin_country), '')),
      lead_time_days = p_lead_time_days, valid_until = p_valid_until, status = p_status, notes = nullif(btrim(p_notes), '')
    where id = p_id and product_id = p_product returning id into v_id;
    if v_id is null then raise exception 'ap: offer not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- تأكيد التوفر: من المنشأة صاحبة العرض أو من الإدارة (availability.confirm). يُسجَّل في تاريخ المخزون.
create or replace function public.ap_confirm_availability(p_offer uuid, p_status public.ap_availability, p_quantity int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.ap_product_offers; v_source text;
begin
  select * into o from public.ap_product_offers where id = p_offer for update;
  if not found then raise exception 'ap: offer not found' using errcode = 'P0002'; end if;
  if ap_private.is_org_member(o.organization_id) and ap_private.org_can_sell(o.organization_id) then v_source := 'partner';
  elsif ap_private.has_permission('availability.confirm') then v_source := 'admin';
  else raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_status = 'pending_confirmation' then raise exception 'ap: invalid status' using errcode = '22023'; end if;
  update public.ap_product_offers set availability_status = p_status,
    stock_quantity = case when p_status = 'out_of_stock' then 0 else p_quantity end, last_confirmed_at = now()
  where id = p_offer;
  insert into public.ap_inventory_snapshots (offer_id, availability_status, quantity, unit_price, currency, source, confirmed_by)
    values (p_offer, p_status, case when p_status = 'out_of_stock' then 0 else p_quantity end, o.unit_price, o.currency, v_source, auth.uid());
end $$;

-- ───────── البحث والعرض العام ─────────
-- يعيد المنتجات المنشورة المطابقة مع أفضل حالة توفر حديثة وأقل سعر بالريال (لا تُجمع عملات مختلفة).
create or replace function public.ap_search_products(p_query text default null, p_brand uuid default null, p_model uuid default null,
  p_year int default null, p_category uuid default null, p_part_type public.ap_part_type default null,
  p_available_only boolean default false, p_price_min numeric default null, p_price_max numeric default null,
  p_limit int default 24, p_offset int default 0)
returns table (id uuid, name text, brand_id uuid, category_id uuid, part_numbers text[], image_path text,
  offers_count int, min_price_sar numeric, part_types public.ap_part_type[], fresh_available boolean, last_confirmed_at timestamptz,
  total_count bigint)
language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(btrim(p_query), '') as text, upper(regexp_replace(coalesce(p_query, ''), '[^0-9A-Za-z]', '', 'g')) as norm
  ), offers as (
    select o.* from public.ap_product_offers o where ap_private.offer_public(o)
  ), matched as (
    select p.* from public.ap_products p, q
    where p.status = 'published'
      and (p_brand is null or p.brand_id = p_brand)
      and (p_category is null or p.category_id = p_category)
      and (q.text is null
           or p.name ilike '%' || q.text || '%'
           or (length(q.norm) >= 3 and exists (select 1 from public.ap_product_identifiers i
                 where i.product_id = p.id and i.normalized like q.norm || '%')))
      and (p_model is null or exists (select 1 from public.ap_vehicle_fitments f where f.product_id = p.id and f.model_id = p_model
             and (p_year is null or ((f.year_from is null or f.year_from <= p_year) and (f.year_to is null or f.year_to >= p_year)))))
      and (p_model is not null or p_year is null or exists (select 1 from public.ap_vehicle_fitments f where f.product_id = p.id
             and (f.year_from is null or f.year_from <= p_year) and (f.year_to is null or f.year_to >= p_year)))
  ), agg as (
    select m.id, m.name, m.brand_id, m.category_id, m.created_at,
      (select array_agg(i.value order by i.kind) from public.ap_product_identifiers i where i.product_id = m.id) as part_numbers,
      (select pm.storage_path from public.ap_product_media pm where pm.product_id = m.id order by pm.sort_order limit 1) as image_path,
      (select count(*)::int from offers o where o.product_id = m.id
         and (p_part_type is null or o.part_type = p_part_type)) as offers_count,
      (select min(o.unit_price) from offers o where o.product_id = m.id and o.currency = 'SAR'
         and (p_part_type is null or o.part_type = p_part_type)) as min_price_sar,
      (select array_agg(distinct o.part_type) from offers o where o.product_id = m.id) as part_types,
      exists (select 1 from offers o where o.product_id = m.id and o.availability_status = 'available'
              and o.last_confirmed_at > now() - ap_private.availability_max_age()
              and (p_part_type is null or o.part_type = p_part_type)) as fresh_available,
      (select max(o.last_confirmed_at) from offers o where o.product_id = m.id) as last_confirmed_at
    from matched m
  )
  select a.id, a.name, a.brand_id, a.category_id, coalesce(a.part_numbers, '{}'), a.image_path, a.offers_count, a.min_price_sar,
    coalesce(a.part_types, '{}'), a.fresh_available, a.last_confirmed_at, count(*) over ()
  from agg a
  where (p_part_type is null or a.offers_count > 0)
    and (not p_available_only or a.fresh_available)
    and (p_price_min is null or a.min_price_sar >= p_price_min)
    and (p_price_max is null or a.min_price_sar <= p_price_max)
  order by a.fresh_available desc, a.offers_count desc, a.created_at desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
$$;

-- العروض العامة لمنتج: بلا هوية المنشأة (يظهر بلد التوريد فقط وفق سياسة الخصوصية)، مع حداثة التأكيد.
create or replace function public.ap_public_offers(p_product uuid)
returns table (id uuid, part_type public.ap_part_type, unit_price numeric, currency text, origin_country text, lead_time_days int,
  availability_status public.ap_availability, stock_quantity int, last_confirmed_at timestamptz, availability_fresh boolean,
  valid_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.part_type, o.unit_price, o.currency::text, o.origin_country::text, o.lead_time_days, o.availability_status,
    case when o.last_confirmed_at > now() - ap_private.availability_max_age() then o.stock_quantity end,
    o.last_confirmed_at,
    o.availability_status = 'available' and o.last_confirmed_at > now() - ap_private.availability_max_age(),
    o.valid_until
  from public.ap_product_offers o
  where o.product_id = p_product and ap_private.offer_public(o)
  order by (o.availability_status = 'available' and o.last_confirmed_at > now() - ap_private.availability_max_age()) desc,
    o.unit_price nulls last
$$;

revoke all on function public.ap_create_product(uuid, uuid, uuid, text, text, text),
  public.ap_update_product(uuid, uuid, uuid, text, text), public.ap_set_product_identifiers(uuid, jsonb),
  public.ap_add_fitment(uuid, uuid, int, int, text, text), public.ap_remove_fitment(uuid),
  public.ap_add_product_media(uuid, text), public.ap_remove_product_media(uuid), public.ap_submit_product(uuid),
  public.ap_admin_review_product(uuid, public.ap_product_status, text),
  public.ap_admin_upsert_model(uuid, uuid, text, text, int, int, boolean),
  public.ap_save_offer(uuid, uuid, uuid, public.ap_part_type, numeric, text, text, int, timestamptz, public.ap_offer_status, text),
  public.ap_confirm_availability(uuid, public.ap_availability, int),
  public.ap_search_products(text, uuid, uuid, int, uuid, public.ap_part_type, boolean, numeric, numeric, int, int),
  public.ap_public_offers(uuid) from public, anon;
grant execute on function public.ap_create_product(uuid, uuid, uuid, text, text, text),
  public.ap_update_product(uuid, uuid, uuid, text, text), public.ap_set_product_identifiers(uuid, jsonb),
  public.ap_add_fitment(uuid, uuid, int, int, text, text), public.ap_remove_fitment(uuid),
  public.ap_add_product_media(uuid, text), public.ap_remove_product_media(uuid), public.ap_submit_product(uuid),
  public.ap_admin_review_product(uuid, public.ap_product_status, text),
  public.ap_admin_upsert_model(uuid, uuid, text, text, int, int, boolean),
  public.ap_save_offer(uuid, uuid, uuid, public.ap_part_type, numeric, text, text, int, timestamptz, public.ap_offer_status, text),
  public.ap_confirm_availability(uuid, public.ap_availability, int) to authenticated;
grant execute on function public.ap_search_products(text, uuid, uuid, int, uuid, public.ap_part_type, boolean, numeric, numeric, int, int),
  public.ap_public_offers(uuid) to anon, authenticated;

revoke all on function ap_private.org_can_sell(uuid), ap_private.product_editable(uuid), ap_private.availability_max_age(),
  ap_private.offer_public(public.ap_product_offers) from public;
grant execute on function ap_private.product_editable(uuid) to authenticated;
