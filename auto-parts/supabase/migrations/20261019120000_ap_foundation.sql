-- المرحلة A — التأسيس: الملفات الشخصية، اللغات، أدوار الإدارة وصلاحياتها، المنشآت وأعضاؤها وصفاتها،
-- سجل التدقيق، وإعدادات المنصة.
-- كل الجداول تبدأ بـ ap_ لأن مشروع Supabase مشترك مع تطبيقات أخرى (فيه public.profiles وpublic.products).
-- القاعدة: لا كتابة مباشرة على البيانات الحساسة من المتصفح؛ الكتابة الحساسة عبر دوال تتحقق من الصلاحية في الخادم.

create schema if not exists ap_private;
revoke all on schema ap_private from public;
grant usage on schema ap_private to anon, authenticated, service_role;

-- ───────── الأنواع ─────────
create type public.ap_staff_role as enum ('super_admin', 'operations_admin', 'finance_admin', 'support_agent');
create type public.ap_capability as enum ('broker', 'seller', 'supplier', 'manufacturer', 'carrier');
create type public.ap_capability_status as enum ('requested', 'approved', 'rejected', 'suspended');
create type public.ap_org_status as enum ('pending', 'active', 'suspended');
create type public.ap_member_role as enum ('owner', 'admin', 'staff');
create type public.ap_member_status as enum ('active', 'removed');

-- ───────── اللغات ─────────
create table public.ap_locales (
  code text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  native_name text not null,
  direction text not null check (direction in ('rtl', 'ltr')),
  enabled boolean not null default true,
  sort_order int not null default 0
);
insert into public.ap_locales (code, native_name, direction, sort_order) values
  ('ar', 'العربية', 'rtl', 1), ('en', 'English', 'ltr', 2), ('zh', '简体中文', 'ltr', 3);

-- ───────── المستخدمون ─────────
create table public.ap_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ap_user_preferences (
  user_id uuid primary key references public.ap_profiles (user_id) on delete cascade,
  locale text not null default 'ar' references public.ap_locales (code),
  timezone text not null default 'Asia/Riyadh' check (char_length(timezone) between 1 and 64),
  updated_at timestamptz not null default now()
);

-- ───────── أدوار الإدارة والصلاحيات ─────────
create table public.ap_roles_permissions (
  role public.ap_staff_role not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);
insert into public.ap_roles_permissions (role, permission)
select 'super_admin'::public.ap_staff_role, p from unnest(array[
  'roles.manage', 'settings.edit', 'accounts.approve', 'customers.read', 'products.publish', 'orders.manage_all',
  'quotes.manage', 'availability.confirm', 'shipping.manage', 'disputes.manage', 'finance.manage', 'commission.edit',
  'refunds.approve', 'reports.read', 'audit.read', 'support.handle']) p
union all
select 'operations_admin'::public.ap_staff_role, p from unnest(array[
  'accounts.approve', 'customers.read', 'products.publish', 'orders.manage_all', 'quotes.manage',
  'availability.confirm', 'shipping.manage', 'disputes.manage', 'reports.read', 'audit.read']) p
union all
select 'finance_admin'::public.ap_staff_role, p from unnest(array[
  'finance.manage', 'commission.edit', 'refunds.approve', 'reports.read', 'audit.read']) p
union all
select 'support_agent'::public.ap_staff_role, p from unnest(array['support.handle']) p;

create table public.ap_staff_roles (
  user_id uuid not null references public.ap_profiles (user_id) on delete cascade,
  role public.ap_staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ───────── المنشآت ─────────
create table public.ap_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  trade_name text check (char_length(trade_name) <= 200),
  entity_type text check (char_length(entity_type) <= 80),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  registered_address text check (char_length(registered_address) <= 500),
  operating_country char(2) check (operating_country ~ '^[A-Z]{2}$'),
  website text check (char_length(website) <= 300),
  activity_description text check (char_length(activity_description) <= 2000),
  preferred_locale text not null default 'ar' references public.ap_locales (code),
  billing_currency char(3) check (billing_currency ~ '^[A-Z]{3}$'),
  status public.ap_org_status not null default 'pending',
  created_by uuid references public.ap_profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_organizations_status_idx on public.ap_organizations (status, created_at desc);

create table public.ap_organization_members (
  organization_id uuid not null references public.ap_organizations (id) on delete cascade,
  user_id uuid not null references public.ap_profiles (user_id) on delete cascade,
  member_role public.ap_member_role not null default 'staff',
  status public.ap_member_status not null default 'active',
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index ap_organization_members_user_idx on public.ap_organization_members (user_id) where status = 'active';

-- كل صفة (بائع، مورد، ...) تُعتمد أو تُرفض منفصلة. اختيار الصفة وحده لا يمنح شيئًا.
create table public.ap_organization_verifications (
  organization_id uuid not null references public.ap_organizations (id) on delete cascade,
  capability public.ap_capability not null,
  status public.ap_capability_status not null default 'requested',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability)
);
create index ap_org_verifications_status_idx on public.ap_organization_verifications (status);

-- ───────── سجل التدقيق والإعدادات ─────────
create table public.ap_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  organization_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ap_audit_logs_created_idx on public.ap_audit_logs (created_at desc);
create index ap_audit_logs_entity_idx on public.ap_audit_logs (entity_type, entity_id);

create table public.ap_platform_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ap_platform_settings (key, value, description, is_public) values
  ('availability_max_age_hours', '48', 'أقصى عمر لتأكيد التوفر قبل أن يتحول الشراء المباشر إلى طلب تسعير', true),
  ('default_locale', '"ar"', 'اللغة الافتراضية للزوار', true),
  ('default_currency', '"SAR"', 'العملة الافتراضية للعرض', true);

-- ───────── دوال مساعدة (غير مكشوفة عبر API لأن ap_private غير منشور) ─────────
create or replace function ap_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function ap_private.is_active_user(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ap_profiles where user_id = uid and status = 'active') $$;

create or replace function ap_private.has_permission(perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select ap_private.is_active_user(auth.uid()) and exists (
    select 1 from public.ap_staff_roles s join public.ap_roles_permissions p on p.role = s.role
    where s.user_id = auth.uid() and p.permission = perm) $$;

create or replace function ap_private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select ap_private.is_active_user(auth.uid())
     and exists (select 1 from public.ap_staff_roles where user_id = auth.uid()) $$;

create or replace function ap_private.is_org_member(org uuid, roles public.ap_member_role[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select ap_private.is_active_user(auth.uid()) and exists (
    select 1 from public.ap_organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
      and (roles is null or m.member_role = any (roles))) $$;

-- تستخدمها المراحل القادمة: هل يحق لهذه المنشأة ممارسة هذه الصفة الآن؟
create or replace function ap_private.org_can(org uuid, cap public.ap_capability) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ap_organizations o join public.ap_organization_verifications v on v.organization_id = o.id
    where o.id = org and o.status = 'active' and v.capability = cap and v.status = 'approved') $$;

create or replace function ap_private.log(p_action text, p_entity_type text, p_entity_id text, p_org uuid, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.ap_audit_logs (actor_id, action, entity_type, entity_id, organization_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_org, coalesce(p_details, '{}'::jsonb)) $$;

-- تدقيق تلقائي على مستوى الجدول: يسجّل التغيير أيًا كان مصدره (دالة، لوحة Supabase، مفتاح الخدمة).
create or replace function ap_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); org uuid; eid text;
begin
  org := case when tg_table_name = 'ap_organizations' then (r->>'id')::uuid else (r->>'organization_id')::uuid end;
  eid := coalesce(r->>'id', r->>'key', concat_ws(':', r->>'organization_id', r->>'user_id', r->>'capability', r->>'role'));
  perform ap_private.log(lower(tg_op), tg_table_name, eid, org,
    jsonb_build_object('old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                       'new', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;

-- تمنع تعديل الحقول المحمية حتى لو أُعطي المستخدم صلاحية تحديث الصف.
create or replace function ap_private.guard_org_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not ap_private.has_permission('accounts.approve') and current_user in ('authenticated', 'anon') and (
       new.status is distinct from old.status or new.legal_name is distinct from old.legal_name
       or new.country_code is distinct from old.country_code or new.created_by is distinct from old.created_by) then
    raise exception 'ap: protected organization fields' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger ap_profiles_touch before update on public.ap_profiles for each row execute function ap_private.touch_updated_at();
create trigger ap_user_preferences_touch before update on public.ap_user_preferences for each row execute function ap_private.touch_updated_at();
create trigger ap_organizations_touch before update on public.ap_organizations for each row execute function ap_private.touch_updated_at();
create trigger ap_organization_members_touch before update on public.ap_organization_members for each row execute function ap_private.touch_updated_at();
create trigger ap_org_verifications_touch before update on public.ap_organization_verifications for each row execute function ap_private.touch_updated_at();
create trigger ap_platform_settings_touch before update on public.ap_platform_settings for each row execute function ap_private.touch_updated_at();
create trigger ap_organizations_guard before update on public.ap_organizations for each row execute function ap_private.guard_org_update();

create trigger ap_staff_roles_audit after insert or update or delete on public.ap_staff_roles for each row execute function ap_private.audit_row();
create trigger ap_organizations_audit after insert or update or delete on public.ap_organizations for each row execute function ap_private.audit_row();
create trigger ap_organization_members_audit after insert or update or delete on public.ap_organization_members for each row execute function ap_private.audit_row();
create trigger ap_org_verifications_audit after insert or update or delete on public.ap_organization_verifications for each row execute function ap_private.audit_row();
create trigger ap_platform_settings_audit after insert or update or delete on public.ap_platform_settings for each row execute function ap_private.audit_row();

create or replace function ap_private.audit_profile_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform ap_private.log('status_change', 'ap_profiles', new.user_id::text, null,
      jsonb_build_object('old', old.status, 'new', new.status));
  end if;
  return new;
end $$;
create trigger ap_profiles_status_audit after update on public.ap_profiles for each row execute function ap_private.audit_profile_status();

-- ───────── الصلاحيات على مستوى الجداول ─────────
-- Supabase يمنح anon وauthenticated كل شيء افتراضيًا على جداول public؛ نسحبها ثم نمنح الحد الأدنى.
revoke all on public.ap_locales, public.ap_profiles, public.ap_user_preferences, public.ap_roles_permissions,
  public.ap_staff_roles, public.ap_organizations, public.ap_organization_members, public.ap_organization_verifications,
  public.ap_audit_logs, public.ap_platform_settings from anon, authenticated;

grant select on public.ap_locales, public.ap_platform_settings to anon, authenticated;
grant select on public.ap_profiles, public.ap_user_preferences, public.ap_roles_permissions, public.ap_staff_roles,
  public.ap_organizations, public.ap_organization_members, public.ap_organization_verifications, public.ap_audit_logs to authenticated;
grant update (full_name, phone) on public.ap_profiles to authenticated;
grant update (locale, timezone) on public.ap_user_preferences to authenticated;
grant update (trade_name, entity_type, registered_address, operating_country, website, activity_description,
  preferred_locale, billing_currency) on public.ap_organizations to authenticated;

alter table public.ap_locales enable row level security;
alter table public.ap_profiles enable row level security;
alter table public.ap_user_preferences enable row level security;
alter table public.ap_roles_permissions enable row level security;
alter table public.ap_staff_roles enable row level security;
alter table public.ap_organizations enable row level security;
alter table public.ap_organization_members enable row level security;
alter table public.ap_organization_verifications enable row level security;
alter table public.ap_audit_logs enable row level security;
alter table public.ap_platform_settings enable row level security;

create policy ap_locales_read on public.ap_locales for select to anon, authenticated using (enabled);

create policy ap_profiles_read on public.ap_profiles for select to authenticated
  using (user_id = (select auth.uid()) or ap_private.has_permission('customers.read') or ap_private.has_permission('roles.manage'));
create policy ap_profiles_update_own on public.ap_profiles for update to authenticated
  using (user_id = (select auth.uid()) and status = 'active') with check (user_id = (select auth.uid()));

create policy ap_prefs_read_own on public.ap_user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy ap_prefs_update_own on public.ap_user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ap_roles_permissions_read on public.ap_roles_permissions for select to authenticated using (true);

create policy ap_staff_roles_read on public.ap_staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or ap_private.has_permission('roles.manage'));

create policy ap_organizations_read on public.ap_organizations for select to authenticated
  using (ap_private.is_org_member(id) or ap_private.is_staff());
create policy ap_organizations_update on public.ap_organizations for update to authenticated
  using (ap_private.is_org_member(id, array['owner', 'admin']::public.ap_member_role[]))
  with check (ap_private.is_org_member(id, array['owner', 'admin']::public.ap_member_role[]));

create policy ap_org_members_read on public.ap_organization_members for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_staff());

create policy ap_org_verifications_read on public.ap_organization_verifications for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_staff());

create policy ap_audit_logs_read on public.ap_audit_logs for select to authenticated using (ap_private.has_permission('audit.read'));

create policy ap_settings_read on public.ap_platform_settings for select to anon, authenticated
  using (is_public or ap_private.is_staff());

-- ───────── دوال API (RPC) ─────────
-- إنشاء الملف الشخصي عند أول دخول. المشروع مشترك، لذلك لا نضع مشغّلًا على auth.users يُنشئ ملفات لمستخدمي التطبيقات الأخرى.
create or replace function public.ap_ensure_profile(p_full_name text default null, p_locale text default null)
returns public.ap_profiles language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); prof public.ap_profiles; loc text;
begin
  if uid is null then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  select * into prof from public.ap_profiles where user_id = uid;
  if found then return prof; end if;
  loc := coalesce((select code from public.ap_locales where code = p_locale and enabled), 'ar');
  insert into public.ap_profiles (user_id, full_name)
    values (uid, left(coalesce(nullif(btrim(p_full_name), ''), ''), 120)) returning * into prof;
  insert into public.ap_user_preferences (user_id, locale) values (uid, loc);
  return prof;
end $$;

-- منح أو سحب دور إداري. لا يمكن سحب آخر مدير أعلى.
create or replace function public.ap_admin_set_staff_role(p_user_id uuid, p_role public.ap_staff_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('roles.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.ap_profiles where user_id = p_user_id) then
    raise exception 'ap: user has no profile' using errcode = 'P0002';
  end if;
  if p_grant then
    insert into public.ap_staff_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
      on conflict (user_id, role) do nothing;
  else
    if p_role = 'super_admin' and (select count(*) from public.ap_staff_roles where role = 'super_admin') <= 1 then
      raise exception 'ap: cannot remove the last super admin' using errcode = 'P0001';
    end if;
    delete from public.ap_staff_roles where user_id = p_user_id and role = p_role;
  end if;
end $$;

-- البحث عن مستخدم بالبريد لمنحه دورًا (للمدير فقط؛ لا يكشف البريد لغيره).
create or replace function public.ap_admin_find_user(p_email text)
returns table (user_id uuid, email text, full_name text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('roles.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  return query select p.user_id, u.email::text, p.full_name
    from auth.users u join public.ap_profiles p on p.user_id = u.id where lower(u.email) = lower(btrim(p_email));
end $$;

create or replace function public.ap_admin_list_staff()
returns table (user_id uuid, email text, full_name text, role public.ap_staff_role, granted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('roles.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  return query select s.user_id, u.email::text, p.full_name, s.role, s.granted_at
    from public.ap_staff_roles s join public.ap_profiles p on p.user_id = s.user_id join auth.users u on u.id = s.user_id
    order by s.granted_at;
end $$;

-- تسجيل منشأة بصفات مطلوبة. تبقى المنشأة pending وكل صفة requested حتى يعتمدها المدير.
create or replace function public.ap_create_organization(p_legal_name text, p_country_code text, p_capabilities public.ap_capability[],
  p_trade_name text default null, p_preferred_locale text default 'ar')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); org uuid;
begin
  if uid is null or not ap_private.is_active_user(uid) then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  if coalesce(array_length(p_capabilities, 1), 0) = 0 then raise exception 'ap: at least one capability' using errcode = '22023'; end if;
  if (select count(*) from public.ap_organizations where created_by = uid and status = 'pending') >= 3 then
    raise exception 'ap: too many pending organizations' using errcode = 'P0001';
  end if;
  insert into public.ap_organizations (legal_name, trade_name, country_code, preferred_locale, created_by)
    values (btrim(p_legal_name), nullif(btrim(p_trade_name), ''), upper(p_country_code),
            coalesce((select code from public.ap_locales where code = p_preferred_locale and enabled), 'ar'), uid)
    returning id into org;
  insert into public.ap_organization_members (organization_id, user_id, member_role, added_by) values (org, uid, 'owner', uid);
  insert into public.ap_organization_verifications (organization_id, capability)
    select org, c from (select distinct unnest(p_capabilities) c) x;
  return org;
end $$;

-- قرار المدير على صفة واحدة. الرفض والإيقاف يتطلبان سببًا. اعتماد أي صفة يفعّل المنشأة.
create or replace function public.ap_admin_decide_capability(p_org uuid, p_capability public.ap_capability,
  p_decision public.ap_capability_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('accounts.approve') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_decision = 'requested' then raise exception 'ap: invalid decision' using errcode = '22023'; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'ap: reason required' using errcode = '22023';
  end if;
  update public.ap_organization_verifications
    set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = nullif(btrim(p_reason), '')
    where organization_id = p_org and capability = p_capability;
  if not found then raise exception 'ap: capability not requested' using errcode = 'P0002'; end if;
  if p_decision = 'approved' then
    update public.ap_organizations set status = 'active' where id = p_org and status = 'pending';
  end if;
end $$;

create or replace function public.ap_admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('settings.edit') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_platform_settings set value = p_value, updated_by = auth.uid() where key = p_key;
  if not found then raise exception 'ap: unknown setting' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.ap_ensure_profile(text, text), public.ap_admin_set_staff_role(uuid, public.ap_staff_role, boolean),
  public.ap_admin_find_user(text), public.ap_admin_list_staff(),
  public.ap_create_organization(text, text, public.ap_capability[], text, text),
  public.ap_admin_decide_capability(uuid, public.ap_capability, public.ap_capability_status, text),
  public.ap_admin_update_setting(text, jsonb) from public, anon;
grant execute on function public.ap_ensure_profile(text, text), public.ap_admin_set_staff_role(uuid, public.ap_staff_role, boolean),
  public.ap_admin_find_user(text), public.ap_admin_list_staff(),
  public.ap_create_organization(text, text, public.ap_capability[], text, text),
  public.ap_admin_decide_capability(uuid, public.ap_capability, public.ap_capability_status, text),
  public.ap_admin_update_setting(text, jsonb) to authenticated;

revoke all on all functions in schema ap_private from public;
grant execute on all functions in schema ap_private to anon, authenticated, service_role;
-- دوال الكتابة في السجل لا تُستدعى إلا من المشغّلات والدوال المملوكة للنظام.
revoke execute on function ap_private.log(text, text, text, uuid, jsonb), ap_private.audit_row(),
  ap_private.audit_profile_status() from anon, authenticated;
