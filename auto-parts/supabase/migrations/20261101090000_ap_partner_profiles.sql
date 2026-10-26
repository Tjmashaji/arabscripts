-- ملف الشريك حسب نوعه: فرد أو منشأة، وحساب بنكي اختياري، وبيانات خدمة الشحن لوكلاء الشحن قبل الاعتماد.
-- اختبارات: supabase/tests/partner_profiles.sql

-- ───────── 1) نوع الحساب وبيانات المنشأة الإضافية ─────────
alter table public.ap_organizations
  add column account_kind text not null default 'company' check (account_kind in ('individual', 'company')),
  add column registration_number text check (char_length(registration_number) <= 60),
  add column vat_number text check (char_length(vat_number) <= 30),
  add column city text check (char_length(city) <= 80);

-- ───────── 2) الحساب البنكي (اختياري) ─────────
-- جدول منفصل: يقرؤه أعضاء المنشأة وفريق الاعتماد والمالية فقط، ولا يُكتب إلا عبر الدالة.
create table public.ap_organization_bank_accounts (
  organization_id uuid primary key references public.ap_organizations (id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 2 and 120),
  account_holder text not null check (char_length(account_holder) between 2 and 200),
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  account_number text check (account_number ~ '^[0-9A-Z -]{4,40}$'),
  swift text check (swift ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (iban is not null or account_number is not null)
);
alter table public.ap_organization_bank_accounts enable row level security;
revoke all on public.ap_organization_bank_accounts from anon, authenticated;
grant select on public.ap_organization_bank_accounts to authenticated;
create policy ap_bank_accounts_read on public.ap_organization_bank_accounts for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.has_permission('accounts.approve')
         or ap_private.has_permission('finance.manage'));

-- مالك المنشأة أو مديرها يحفظ الحساب أو يمسحه (اسم بنك فارغ = حذف). التعديل يُسجَّل في التدقيق بلا الأرقام نفسها.
create or replace function public.ap_save_bank_account(p_org uuid, p_bank_name text, p_holder text, p_iban text,
  p_account_number text, p_swift text, p_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_iban text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), '');
  v_number text := nullif(upper(btrim(coalesce(p_account_number, ''))), '');
  v_swift text := nullif(upper(regexp_replace(coalesce(p_swift, ''), '\s', '', 'g')), '');
begin
  if not ap_private.is_org_member(p_org, array['owner', 'admin']::public.ap_member_role[]) or not ap_private.is_active_user(auth.uid()) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_bank_name, '')), '') is null then
    delete from public.ap_organization_bank_accounts where organization_id = p_org;
  else
    insert into public.ap_organization_bank_accounts (organization_id, bank_name, account_holder, iban, account_number, swift, currency, updated_by)
      values (p_org, btrim(p_bank_name), btrim(p_holder), v_iban, v_number, v_swift, upper(nullif(btrim(p_currency), '')), auth.uid())
      on conflict (organization_id) do update set bank_name = excluded.bank_name, account_holder = excluded.account_holder,
        iban = excluded.iban, account_number = excluded.account_number, swift = excluded.swift, currency = excluded.currency,
        updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform ap_private.log('bank_account_updated', 'ap_organizations', p_org::text, p_org, '{}'::jsonb);
end $$;
revoke all on function public.ap_save_bank_account(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.ap_save_bank_account(uuid, text, text, text, text, text, text) to authenticated;

-- ───────── 3) خدمة الشحن: التكلفة وموقع الاستلام، وتُضاف قبل الاعتماد ─────────
alter table public.ap_carrier_services
  add column price_per_kg numeric(10, 2) check (price_per_kg >= 0),
  add column price_currency char(3) check (price_currency ~ '^[A-Z]{3}$'),
  add column min_charge numeric(10, 2) check (min_charge >= 0),
  add column pickup_location text check (char_length(pickup_location) <= 200);

drop function public.ap_save_carrier_service(uuid, uuid, text, public.ap_shipping_mode, text[], text[], int, int, text, boolean);
-- الناقل المعتمد يدير خدماته كما كان؛ وطالب صفة الناقل (مالك أو مدير المنشأة) يضيفها قبل الاعتماد ليراها فريق المراجعة.
-- طلبات عروض الشحن والإسناد تبقى للناقل المعتمد فقط (ap_private.org_can كما هو).
create function public.ap_save_carrier_service(p_id uuid, p_org uuid, p_name text, p_mode public.ap_shipping_mode,
  p_origins text[], p_destinations text[], p_days_min int, p_days_max int, p_notes text, p_enabled boolean,
  p_price_per_kg numeric default null, p_price_currency text default null, p_min_charge numeric default null,
  p_pickup_location text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid := p_org;
begin
  if p_id is not null then select organization_id into v_org from public.ap_carrier_services where id = p_id; end if;
  if not (ap_private.carrier_member(v_org)
          or (ap_private.is_org_member(v_org, array['owner', 'admin']::public.ap_member_role[])
              and exists (select 1 from public.ap_organization_verifications v
                          where v.organization_id = v_org and v.capability = 'carrier' and v.status = 'requested'))) then
    raise exception 'ap: organization not approved as carrier' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_origins, '{}') || coalesce(p_destinations, '{}')) c where c !~ '^[A-Z]{2}$') then
    raise exception 'ap: invalid country' using errcode = '22023';
  end if;
  if p_days_min is not null and p_days_max is not null and p_days_max < p_days_min then
    raise exception 'ap: invalid transit days' using errcode = '22023';
  end if;
  if p_price_per_kg is not null and upper(coalesce(p_price_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'ap: currency required' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ap_carrier_services (organization_id, name, mode, origin_countries, destination_countries,
      transit_days_min, transit_days_max, notes, enabled, price_per_kg, price_currency, min_charge, pickup_location)
    values (v_org, btrim(p_name), p_mode, coalesce(p_origins, '{}'), coalesce(p_destinations, '{}'), p_days_min, p_days_max,
      nullif(btrim(p_notes), ''), coalesce(p_enabled, true), p_price_per_kg, upper(nullif(btrim(p_price_currency), '')), p_min_charge,
      nullif(btrim(p_pickup_location), '')) returning id into v_id;
  else
    update public.ap_carrier_services set name = btrim(p_name), mode = p_mode, origin_countries = coalesce(p_origins, '{}'),
      destination_countries = coalesce(p_destinations, '{}'), transit_days_min = p_days_min, transit_days_max = p_days_max,
      notes = nullif(btrim(p_notes), ''), enabled = coalesce(p_enabled, true), price_per_kg = p_price_per_kg,
      price_currency = upper(nullif(btrim(p_price_currency), '')), min_charge = p_min_charge,
      pickup_location = nullif(btrim(p_pickup_location), '')
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.ap_save_carrier_service(uuid, uuid, text, public.ap_shipping_mode, text[], text[], int, int, text, boolean,
  numeric, text, numeric, text) from public, anon;
grant execute on function public.ap_save_carrier_service(uuid, uuid, text, public.ap_shipping_mode, text[], text[], int, int, text, boolean,
  numeric, text, numeric, text) to authenticated;

-- ───────── 4) التسجيل الذاتي مع نوع الحساب ─────────
drop function public.ap_partner_self_register(text, text, public.ap_capability[], text);
create function public.ap_partner_self_register(p_legal_name text, p_country_code text,
  p_capabilities public.ap_capability[], p_locale text default 'ar', p_account_kind text default 'company')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_email text; v_org uuid; v_app uuid; v_locale text;
begin
  if uid is null or not ap_private.is_active_user(uid) then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'ap: email not confirmed' using errcode = '42501'; end if;
  if exists (select 1 from public.ap_organization_members where user_id = uid and status = 'active') then
    raise exception 'ap: already partner' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_legal_name, ''))) not between 2 and 200 or upper(coalesce(p_country_code, '')) !~ '^[A-Z]{2}$'
     or coalesce(p_account_kind, '') not in ('individual', 'company') then
    raise exception 'ap: invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_capabilities), 0) = 0 or 'broker' = any(p_capabilities) then
    raise exception 'ap: invalid capabilities' using errcode = '22023';
  end if;
  select code into v_locale from public.ap_locales where code = p_locale and enabled;

  insert into public.ap_organizations (legal_name, country_code, preferred_locale, created_by, account_kind)
    values (btrim(p_legal_name), upper(p_country_code), coalesce(v_locale, 'ar'), uid, p_account_kind) returning id into v_org;
  insert into public.ap_organization_members (organization_id, user_id, member_role, added_by) values (v_org, uid, 'owner', uid);
  insert into public.ap_organization_verifications (organization_id, capability)
    select distinct v_org, c from unnest(p_capabilities) c;
  -- للفرد: اسمه هو اسم المسؤول عن الحساب.
  insert into public.ap_partner_applications (organization_id, invitation_id, submitted_by, contact_email, contact_name)
    values (v_org, null, uid, v_email, case when p_account_kind = 'individual' then btrim(p_legal_name) end) returning id into v_app;
  return v_app;
end $$;
revoke all on function public.ap_partner_self_register(text, text, public.ap_capability[], text, text) from public, anon;
grant execute on function public.ap_partner_self_register(text, text, public.ap_capability[], text, text) to authenticated;

-- ───────── 5) حفظ الطلب بالحقول الجديدة ─────────
create or replace function public.ap_save_application(p_app uuid, p_data jsonb, p_capabilities public.ap_capability[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_kind text;
begin
  if not ap_private.application_editable(p_app) then raise exception 'ap: application not editable' using errcode = '42501'; end if;
  select organization_id into v_org from public.ap_partner_applications where id = p_app;
  v_kind := case when p_data->>'account_kind' in ('individual', 'company') then p_data->>'account_kind' end;
  update public.ap_organizations set
    account_kind = coalesce(v_kind, account_kind),
    legal_name = coalesce(nullif(btrim(p_data->>'legal_name'), ''), legal_name),
    trade_name = nullif(btrim(p_data->>'trade_name'), ''),
    entity_type = nullif(btrim(p_data->>'entity_type'), ''),
    registration_number = nullif(btrim(p_data->>'registration_number'), ''),
    vat_number = nullif(btrim(p_data->>'vat_number'), ''),
    country_code = coalesce(upper(nullif(btrim(p_data->>'country_code'), '')), country_code),
    city = nullif(btrim(p_data->>'city'), ''),
    registered_address = nullif(btrim(p_data->>'registered_address'), ''),
    operating_country = upper(nullif(btrim(p_data->>'operating_country'), '')),
    website = nullif(btrim(p_data->>'website'), ''),
    activity_description = nullif(btrim(p_data->>'activity_description'), ''),
    billing_currency = upper(nullif(btrim(p_data->>'billing_currency'), ''))
  where id = v_org;
  update public.ap_partner_applications a set
    contact_name = coalesce(nullif(btrim(p_data->>'contact_name'), ''),
      case when o.account_kind = 'individual' then o.legal_name end),
    contact_title = nullif(btrim(p_data->>'contact_title'), ''),
    contact_phone = nullif(btrim(p_data->>'contact_phone'), ''),
    contact_email = lower(nullif(btrim(p_data->>'contact_email'), '')),
    languages = coalesce((select array_agg(l.x order by l.n) from jsonb_array_elements_text(coalesce(p_data->'languages', '[]'::jsonb))
                            with ordinality as l(x, n)
                          where l.x in (select code from public.ap_locales)), '{}'),
    declaration_accepted_at = case when (p_data->>'declaration')::boolean then coalesce(a.declaration_accepted_at, now()) else null end
  from public.ap_organizations o
  where a.id = p_app and o.id = a.organization_id;
  if p_capabilities is not null then
    if cardinality(p_capabilities) = 0 then raise exception 'ap: at least one capability' using errcode = '22023'; end if;
    delete from public.ap_organization_verifications
      where organization_id = v_org and status = 'requested' and capability <> all (p_capabilities);
    insert into public.ap_organization_verifications (organization_id, capability)
      select v_org, c from unnest(p_capabilities) c on conflict do nothing;
  end if;
end $$;

-- ───────── 6) ما ينقص الطلب حسب نوعه ─────────
create or replace function ap_private.application_missing(p_app uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when coalesce(btrim(o.legal_name), '') = '' then 'legal_name' end,
    case when o.country_code is null then 'country_code' end,
    case when coalesce(btrim(o.registered_address), '') = '' then 'registered_address' end,
    case when coalesce(btrim(o.activity_description), '') = '' then 'activity_description' end,
    case when o.account_kind = 'company' and coalesce(btrim(o.registration_number), '') = '' then 'registration_number' end,
    case when o.account_kind = 'company' and coalesce(btrim(a.contact_name), '') = '' then 'contact_name' end,
    case when a.contact_phone is null then 'contact_phone' end,
    case when a.contact_email is null then 'contact_email' end,
    case when a.declaration_accepted_at is null then 'declaration' end,
    case when not exists (select 1 from public.ap_organization_verifications v where v.organization_id = o.id) then 'capabilities' end,
    case when not exists (select 1 from public.ap_verification_documents d where d.application_id = a.id) then 'documents' end,
    case when o.account_kind = 'company' and not exists (select 1 from public.ap_verification_documents d
      where d.application_id = a.id and d.document_type in ('commercial_register', 'business_license')) then 'registration_document' end,
    case when o.account_kind = 'individual' and not exists (select 1 from public.ap_verification_documents d
      where d.application_id = a.id and d.document_type = 'identity_document') then 'identity_document' end,
    case when exists (select 1 from public.ap_organization_verifications v where v.organization_id = o.id and v.capability = 'carrier'
                      and v.status = 'requested')
         and not exists (select 1 from public.ap_carrier_services s where s.organization_id = o.id and s.price_per_kg is not null)
      then 'carrier_services' end
  ], null)
  from public.ap_partner_applications a join public.ap_organizations o on o.id = a.organization_id
  where a.id = p_app $$;

-- للصفحات: صاحب الطلب أو فريق الاعتماد يرى ما ينقص.
create or replace function public.ap_application_missing(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.ap_partner_applications where id = p_app;
  if v_org is null or not (ap_private.is_org_member(v_org) or ap_private.has_permission('accounts.approve')) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  return ap_private.application_missing(p_app);
end $$;
revoke all on function public.ap_application_missing(uuid) from public, anon;
grant execute on function public.ap_application_missing(uuid) to authenticated;
