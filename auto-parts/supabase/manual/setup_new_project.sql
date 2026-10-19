-- إعداد مشروع Supabase جديد للمنصة من الصفر: انسخ هذا الملف كاملًا ← SQL Editor ← Run (مرة واحدة فقط).
-- يجمع كل ملفات supabase/migrations بالترتيب.

-- ═════ 20261019120000_ap_foundation.sql ═════
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

-- ═════ 20261019120100_ap_block_anonymous.sql ═════
-- مشروع Supabase المشترك يسمح بالدخول المجهول (anonymous sign-ins)، وجلسته تحمل دور authenticated.
-- لا ملف شخصي لجلسة مجهولة، وبالتالي لا منشأة ولا صلاحيات (كل الفحوص تمر عبر ap_private.is_active_user).
create or replace function public.ap_ensure_profile(p_full_name text default null, p_locale text default null)
returns public.ap_profiles language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); prof public.ap_profiles; loc text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'ap: not authenticated' using errcode = '42501';
  end if;
  select * into prof from public.ap_profiles where user_id = uid;
  if found then return prof; end if;
  loc := coalesce((select code from public.ap_locales where code = p_locale and enabled), 'ar');
  insert into public.ap_profiles (user_id, full_name)
    values (uid, left(coalesce(nullif(btrim(p_full_name), ''), ''), 120)) returning * into prof;
  insert into public.ap_user_preferences (user_id, locale) values (uid, loc);
  return prof;
end $$;
revoke all on function public.ap_ensure_profile(text, text) from public, anon;
grant execute on function public.ap_ensure_profile(text, text) to authenticated;

-- ═════ 20261020090000_ap_partners.sql ═════
-- المرحلة B1 — الشركاء: الدعوات، طلبات الاعتماد، مستندات التحقق في تخزين خاص، قرارات المراجعة، والإشعارات.
-- الصفات المطلوبة لكل طلب هي صفوف ap_organization_verifications (من المرحلة A)؛ كل صفة تُعتمد أو تُرفض منفصلة.

create type public.ap_invitation_status as enum ('created', 'opened', 'accepted', 'expired', 'revoked');
create type public.ap_application_status as enum (
  'draft_application', 'submitted_for_review', 'under_review', 'changes_requested', 'resubmitted', 'approved', 'rejected', 'suspended');
create type public.ap_review_decision as enum ('under_review', 'approved', 'rejected', 'changes_requested');
create type public.ap_document_status as enum ('pending', 'accepted', 'rejected');

-- ───────── الدعوات ─────────
-- الرمز الخام يُعرض مرة واحدة للمدير عند الإنشاء؛ المخزّن بصمته فقط (sha256).
create table public.ap_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  expected_capabilities public.ap_capability[] not null check (cardinality(expected_capabilities) > 0),
  preferred_locale text not null default 'ar' references public.ap_locales (code),
  message text check (char_length(message) <= 1000),
  token_hash text not null unique,
  expires_at timestamptz not null,
  status public.ap_invitation_status not null default 'created',
  created_by uuid references auth.users (id) on delete set null,
  opened_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_invitations_email_idx on public.ap_invitations (lower(email));
create index ap_invitations_status_idx on public.ap_invitations (status, created_at desc);

-- ───────── طلبات الاعتماد ─────────
create table public.ap_partner_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.ap_organizations (id) on delete cascade,
  invitation_id uuid references public.ap_invitations (id) on delete set null,
  submitted_by uuid not null references public.ap_profiles (user_id) on delete cascade,
  status public.ap_application_status not null default 'draft_application',
  contact_name text check (char_length(contact_name) <= 120),
  contact_title text check (char_length(contact_title) <= 120),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{6,20}$'),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  languages text[] not null default '{}',
  declaration_accepted_at timestamptz,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ap_partner_applications_status_idx on public.ap_partner_applications (status, submitted_at desc);

create table public.ap_verification_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.ap_partner_applications (id) on delete cascade,
  organization_id uuid not null references public.ap_organizations (id) on delete cascade,
  document_type text not null check (document_type ~ '^[a-z_]{2,40}$'),
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  issuing_country char(2) check (issuing_country ~ '^[A-Z]{2}$'),
  document_expiry_date date,
  status public.ap_document_status not null default 'pending',
  review_notes text check (char_length(review_notes) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ap_verification_documents_app_idx on public.ap_verification_documents (application_id);

-- سجل القرارات لا يُعدّل ولا يُحذف (لا توجد صلاحية update/delete لأحد).
create table public.ap_application_reviews (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.ap_partner_applications (id) on delete cascade,
  reviewer_id uuid references auth.users (id) on delete set null,
  decision public.ap_review_decision not null,
  reason text check (char_length(reason) <= 2000),
  approved_capabilities public.ap_capability[] not null default '{}',
  rejected_capabilities public.ap_capability[] not null default '{}',
  override_reason text check (char_length(override_reason) <= 1000),
  created_at timestamptz not null default now()
);
create index ap_application_reviews_app_idx on public.ap_application_reviews (application_id, created_at desc);

create table public.ap_application_change_requests (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.ap_partner_applications (id) on delete cascade,
  review_id bigint references public.ap_application_reviews (id) on delete set null,
  requested_fields text[] not null default '{}',
  note text not null check (char_length(note) between 1 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ap_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.ap_profiles (user_id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,60}$'),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index ap_notifications_user_idx on public.ap_notifications (user_id, created_at desc);

create trigger ap_invitations_touch before update on public.ap_invitations for each row execute function ap_private.touch_updated_at();
create trigger ap_partner_applications_touch before update on public.ap_partner_applications for each row execute function ap_private.touch_updated_at();
create trigger ap_invitations_audit after insert or update or delete on public.ap_invitations for each row execute function ap_private.audit_row();
create trigger ap_partner_applications_audit after insert or update or delete on public.ap_partner_applications for each row execute function ap_private.audit_row();
create trigger ap_verification_documents_audit after insert or update or delete on public.ap_verification_documents for each row execute function ap_private.audit_row();

-- ───────── مساعدات ─────────
create or replace function ap_private.token_hash(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex') $$;

create or replace function ap_private.notify(p_user uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.ap_notifications (user_id, kind, payload) values (p_user, p_kind, coalesce(p_payload, '{}'::jsonb)) $$;

create or replace function ap_private.application_editable(p_app uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ap_partner_applications a
    where a.id = p_app and a.status in ('draft_application', 'changes_requested')
      and ap_private.is_org_member(a.organization_id, array['owner', 'admin']::public.ap_member_role[])) $$;

-- ما الذي ينقص الطلب قبل إرساله أو اعتماده؟ (قائمة فارغة = مكتمل)
create or replace function ap_private.application_missing(p_app uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when coalesce(btrim(o.legal_name), '') = '' then 'legal_name' end,
    case when o.country_code is null then 'country_code' end,
    case when coalesce(btrim(o.activity_description), '') = '' then 'activity_description' end,
    case when coalesce(btrim(a.contact_name), '') = '' then 'contact_name' end,
    case when a.contact_phone is null then 'contact_phone' end,
    case when a.contact_email is null then 'contact_email' end,
    case when a.declaration_accepted_at is null then 'declaration' end,
    case when not exists (select 1 from public.ap_organization_verifications v where v.organization_id = o.id) then 'capabilities' end,
    case when not exists (select 1 from public.ap_verification_documents d where d.application_id = a.id) then 'documents' end
  ], null)
  from public.ap_partner_applications a join public.ap_organizations o on o.id = a.organization_id
  where a.id = p_app $$;

-- ───────── الصلاحيات و RLS ─────────
revoke all on public.ap_invitations, public.ap_partner_applications, public.ap_verification_documents,
  public.ap_application_reviews, public.ap_application_change_requests, public.ap_notifications from anon, authenticated;
grant select on public.ap_invitations, public.ap_partner_applications, public.ap_verification_documents,
  public.ap_application_reviews, public.ap_application_change_requests, public.ap_notifications to authenticated;
grant update (read_at) on public.ap_notifications to authenticated;

alter table public.ap_invitations enable row level security;
alter table public.ap_partner_applications enable row level security;
alter table public.ap_verification_documents enable row level security;
alter table public.ap_application_reviews enable row level security;
alter table public.ap_application_change_requests enable row level security;
alter table public.ap_notifications enable row level security;

create policy ap_invitations_read on public.ap_invitations for select to authenticated
  using (ap_private.has_permission('accounts.approve'));
create policy ap_applications_read on public.ap_partner_applications for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.has_permission('accounts.approve'));
create policy ap_documents_read on public.ap_verification_documents for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.has_permission('accounts.approve'));
create policy ap_reviews_read on public.ap_application_reviews for select to authenticated
  using (ap_private.has_permission('accounts.approve') or exists (
    select 1 from public.ap_partner_applications a where a.id = application_id and ap_private.is_org_member(a.organization_id)));
create policy ap_change_requests_read on public.ap_application_change_requests for select to authenticated
  using (ap_private.has_permission('accounts.approve') or exists (
    select 1 from public.ap_partner_applications a where a.id = application_id and ap_private.is_org_member(a.organization_id)));
create policy ap_notifications_read on public.ap_notifications for select to authenticated using (user_id = (select auth.uid()));
create policy ap_notifications_mark_read on public.ap_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────── التخزين الخاص للمستندات ─────────
-- المسار: <organization_id>/<uuid>.<ext>. لا وصول عام؛ العرض بروابط مؤقتة لمن تسمح له السياسة.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ap-verification-docs', 'ap-verification-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy ap_docs_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'ap-verification-docs' and (
    ap_private.has_permission('accounts.approve')
    or ap_private.is_org_member(((storage.foldername(name))[1])::uuid)));
create policy ap_docs_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ap-verification-docs' and exists (
    select 1 from public.ap_partner_applications a
    where a.organization_id = ((storage.foldername(name))[1])::uuid and ap_private.application_editable(a.id)));
create policy ap_docs_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ap-verification-docs' and exists (
    select 1 from public.ap_partner_applications a
    where a.organization_id = ((storage.foldername(name))[1])::uuid and ap_private.application_editable(a.id)));

-- ───────── دوال المدير: الدعوات ─────────
create or replace function public.ap_admin_create_invitation(p_email text, p_capabilities public.ap_capability[],
  p_locale text default 'ar', p_message text default null, p_valid_days int default 14)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex'); v_id uuid; v_exp timestamptz;
begin
  if not ap_private.has_permission('accounts.approve') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if coalesce(cardinality(p_capabilities), 0) = 0 then raise exception 'ap: at least one capability' using errcode = '22023'; end if;
  if p_valid_days not between 1 and 60 then raise exception 'ap: invalid validity' using errcode = '22023'; end if;
  v_exp := now() + make_interval(days => p_valid_days);
  insert into public.ap_invitations (email, expected_capabilities, preferred_locale, message, token_hash, expires_at, created_by)
    values (lower(btrim(p_email)), (select array_agg(distinct c) from unnest(p_capabilities) c),
            coalesce((select code from public.ap_locales where code = p_locale and enabled), 'ar'),
            nullif(btrim(p_message), ''), ap_private.token_hash(v_token), v_exp, auth.uid())
    returning ap_invitations.id into v_id;
  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.ap_admin_revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('accounts.approve') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_invitations set status = 'revoked', revoked_by = auth.uid(), revoked_at = now()
    where id = p_id and status in ('created', 'opened');
  if not found then raise exception 'ap: invitation not revocable' using errcode = 'P0001'; end if;
end $$;

-- ───────── صفحة الدعوة (متاحة للزائر بالرمز فقط) ─────────
create or replace function public.ap_invitation_lookup(p_token text)
returns table (status text, email text, capabilities public.ap_capability[], preferred_locale text, message text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare inv public.ap_invitations;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return; end if;
  select * into inv from public.ap_invitations i where i.token_hash = ap_private.token_hash(p_token);
  if not found then return; end if;
  if inv.status in ('created', 'opened') and inv.expires_at < now() then
    update public.ap_invitations set status = 'expired' where id = inv.id;
    inv.status := 'expired';
  elsif inv.status = 'created' then
    update public.ap_invitations set status = 'opened', opened_at = now() where id = inv.id;
    inv.status := 'opened';
  end if;
  return query select inv.status::text, inv.email, inv.expected_capabilities, inv.preferred_locale, inv.message, inv.expires_at;
end $$;

-- قبول الدعوة: بحساب مفعّل بريده هو نفس بريد الدعوة. ينشئ المنشأة (معلّقة) وطلب اعتماد مسودة. الرمز لا يُستخدم مرتين.
create or replace function public.ap_accept_invitation(p_token text, p_legal_name text, p_country_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inv public.ap_invitations; v_email text; v_org uuid; v_app uuid;
begin
  if uid is null or not ap_private.is_active_user(uid) then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  select * into inv from public.ap_invitations where token_hash = ap_private.token_hash(coalesce(p_token, '')) for update;
  if not found then raise exception 'ap: invitation not found' using errcode = 'P0002'; end if;
  if inv.status not in ('created', 'opened') or inv.expires_at < now() then
    raise exception 'ap: invitation not usable' using errcode = 'P0001';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if v_email is null or v_email <> inv.email then raise exception 'ap: invitation email mismatch' using errcode = '42501'; end if;

  insert into public.ap_organizations (legal_name, country_code, preferred_locale, created_by)
    values (btrim(p_legal_name), upper(p_country_code), inv.preferred_locale, uid) returning id into v_org;
  insert into public.ap_organization_members (organization_id, user_id, member_role, added_by) values (v_org, uid, 'owner', uid);
  insert into public.ap_organization_verifications (organization_id, capability)
    select v_org, c from unnest(inv.expected_capabilities) c;
  insert into public.ap_partner_applications (organization_id, invitation_id, submitted_by, contact_email)
    values (v_org, inv.id, uid, v_email) returning id into v_app;
  update public.ap_invitations set status = 'accepted', accepted_by = uid, accepted_at = now() where id = inv.id;
  return v_app;
end $$;

-- ───────── دوال المتقدّم ─────────
-- حفظ بيانات الطلب والمنشأة معًا، فقط أثناء المسودة أو بعد طلب التعديل.
create or replace function public.ap_save_application(p_app uuid, p_data jsonb, p_capabilities public.ap_capability[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if not ap_private.application_editable(p_app) then raise exception 'ap: application not editable' using errcode = '42501'; end if;
  select organization_id into v_org from public.ap_partner_applications where id = p_app;
  update public.ap_organizations set
    legal_name = coalesce(nullif(btrim(p_data->>'legal_name'), ''), legal_name),
    trade_name = nullif(btrim(p_data->>'trade_name'), ''),
    entity_type = nullif(btrim(p_data->>'entity_type'), ''),
    country_code = coalesce(upper(nullif(btrim(p_data->>'country_code'), '')), country_code),
    registered_address = nullif(btrim(p_data->>'registered_address'), ''),
    operating_country = upper(nullif(btrim(p_data->>'operating_country'), '')),
    website = nullif(btrim(p_data->>'website'), ''),
    activity_description = nullif(btrim(p_data->>'activity_description'), ''),
    billing_currency = upper(nullif(btrim(p_data->>'billing_currency'), ''))
  where id = v_org;
  update public.ap_partner_applications set
    contact_name = nullif(btrim(p_data->>'contact_name'), ''),
    contact_title = nullif(btrim(p_data->>'contact_title'), ''),
    contact_phone = nullif(btrim(p_data->>'contact_phone'), ''),
    contact_email = lower(nullif(btrim(p_data->>'contact_email'), '')),
    languages = coalesce((select array_agg(l.x order by l.n) from jsonb_array_elements_text(coalesce(p_data->'languages', '[]'::jsonb))
                            with ordinality as l(x, n)
                          where l.x in (select code from public.ap_locales)), '{}'),
    declaration_accepted_at = case when (p_data->>'declaration')::boolean then coalesce(declaration_accepted_at, now()) else null end
  where id = p_app;
  if p_capabilities is not null then
    if cardinality(p_capabilities) = 0 then raise exception 'ap: at least one capability' using errcode = '22023'; end if;
    delete from public.ap_organization_verifications
      where organization_id = v_org and status = 'requested' and capability <> all (p_capabilities);
    insert into public.ap_organization_verifications (organization_id, capability)
      select v_org, c from unnest(p_capabilities) c on conflict do nothing;
  end if;
end $$;

-- تسجيل مستند بعد رفعه إلى التخزين الخاص (المسار يجب أن يبدأ بمعرّف المنشأة، والملف موجود فعلًا).
create or replace function public.ap_add_document(p_app uuid, p_type text, p_path text, p_file_name text,
  p_mime text, p_size int, p_issuing_country text default null, p_expiry date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  if not ap_private.application_editable(p_app) then raise exception 'ap: application not editable' using errcode = '42501'; end if;
  select organization_id into v_org from public.ap_partner_applications where id = p_app;
  if split_part(p_path, '/', 1) <> v_org::text then raise exception 'ap: invalid path' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'ap-verification-docs' and name = p_path) then
    raise exception 'ap: file not uploaded' using errcode = 'P0002';
  end if;
  if (select count(*) from public.ap_verification_documents where application_id = p_app) >= 20 then
    raise exception 'ap: too many documents' using errcode = 'P0001';
  end if;
  insert into public.ap_verification_documents (application_id, organization_id, document_type, storage_path, file_name,
    mime_type, size_bytes, issuing_country, document_expiry_date, uploaded_by)
  values (p_app, v_org, p_type, p_path, left(p_file_name, 200), p_mime, p_size, upper(nullif(btrim(p_issuing_country), '')), p_expiry, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ap_remove_document(p_doc uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.ap_verification_documents;
begin
  select * into d from public.ap_verification_documents where id = p_doc;
  if not found or not ap_private.application_editable(d.application_id) then
    raise exception 'ap: application not editable' using errcode = '42501';
  end if;
  delete from public.ap_verification_documents where id = p_doc;
  return d.storage_path;
end $$;

create or replace function public.ap_submit_application(p_app uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_missing text[]; v_status public.ap_application_status;
begin
  if not ap_private.application_editable(p_app) then raise exception 'ap: application not editable' using errcode = '42501'; end if;
  v_missing := ap_private.application_missing(p_app);
  if cardinality(v_missing) > 0 then
    raise exception 'ap: incomplete application: %', array_to_string(v_missing, ',') using errcode = '22023';
  end if;
  select status into v_status from public.ap_partner_applications where id = p_app;
  update public.ap_partner_applications
    set status = case when v_status = 'changes_requested' then 'resubmitted'::public.ap_application_status
                      else 'submitted_for_review'::public.ap_application_status end,
        submitted_at = now()
    where id = p_app;
  update public.ap_application_change_requests set resolved_at = now() where application_id = p_app and resolved_at is null;
end $$;

-- ───────── دوال المدير: المراجعة ─────────
create or replace function public.ap_admin_start_review(p_app uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('accounts.approve') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  update public.ap_partner_applications set status = 'under_review'
    where id = p_app and status in ('submitted_for_review', 'resubmitted');
  if found then
    insert into public.ap_application_reviews (application_id, reviewer_id, decision) values (p_app, auth.uid(), 'under_review');
  end if;
end $$;

-- قرار واحد على الطلب. الموافقة تتطلب طلبًا مكتملًا إلا باستثناء موثّق بسبب. الرفض وطلب التعديل يتطلبان سببًا.
create or replace function public.ap_admin_review_application(p_app uuid, p_decision public.ap_review_decision, p_reason text,
  p_approved public.ap_capability[] default '{}', p_requested_fields text[] default '{}', p_override_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.ap_partner_applications; v_review bigint; v_missing text[]; v_requested public.ap_capability[]; v_rejected public.ap_capability[];
begin
  if not ap_private.has_permission('accounts.approve') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  select * into a from public.ap_partner_applications where id = p_app for update;
  if not found then raise exception 'ap: application not found' using errcode = 'P0002'; end if;
  if a.status not in ('submitted_for_review', 'under_review', 'resubmitted') then
    raise exception 'ap: application not under review' using errcode = 'P0001';
  end if;
  if p_decision = 'under_review' then raise exception 'ap: invalid decision' using errcode = '22023'; end if;
  if p_decision in ('rejected', 'changes_requested') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'ap: reason required' using errcode = '22023';
  end if;

  select coalesce(array_agg(capability), '{}') into v_requested
    from public.ap_organization_verifications where organization_id = a.organization_id and status = 'requested';

  if p_decision = 'approved' then
    if coalesce(cardinality(p_approved), 0) = 0 or not (p_approved <@ v_requested) then
      raise exception 'ap: approve at least one requested capability' using errcode = '22023';
    end if;
    v_missing := ap_private.application_missing(p_app);
    if cardinality(v_missing) > 0 and coalesce(btrim(p_override_reason), '') = '' then
      raise exception 'ap: incomplete application: %', array_to_string(v_missing, ',') using errcode = '22023';
    end if;
    select coalesce(array_agg(c), '{}') into v_rejected from unnest(v_requested) c where c <> all (p_approved);
    if cardinality(v_rejected) > 0 and coalesce(btrim(p_reason), '') = '' then
      raise exception 'ap: reason required for rejected capabilities' using errcode = '22023';
    end if;
    update public.ap_organization_verifications
      set status = case when capability = any (p_approved) then 'approved'::public.ap_capability_status else 'rejected'::public.ap_capability_status end,
          decided_by = auth.uid(), decided_at = now(),
          decision_reason = case when capability = any (p_approved) then null else nullif(btrim(p_reason), '') end
      where organization_id = a.organization_id and status = 'requested';
    update public.ap_organizations set status = 'active' where id = a.organization_id and status = 'pending';
  elsif p_decision = 'rejected' then
    v_rejected := v_requested;
    update public.ap_organization_verifications
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_reason = btrim(p_reason)
      where organization_id = a.organization_id and status = 'requested';
  end if;

  update public.ap_partner_applications
    set status = case p_decision when 'approved' then 'approved'::public.ap_application_status
                                 when 'rejected' then 'rejected'::public.ap_application_status
                                 else 'changes_requested'::public.ap_application_status end,
        reviewed_by = auth.uid(), reviewed_at = now(), decision_reason = nullif(btrim(p_reason), '')
    where id = p_app;

  insert into public.ap_application_reviews (application_id, reviewer_id, decision, reason, approved_capabilities,
    rejected_capabilities, override_reason)
  values (p_app, auth.uid(), p_decision, nullif(btrim(p_reason), ''),
    case when p_decision = 'approved' then p_approved else '{}' end, coalesce(v_rejected, '{}'), nullif(btrim(p_override_reason), ''))
  returning id into v_review;

  if p_decision = 'changes_requested' then
    insert into public.ap_application_change_requests (application_id, review_id, requested_fields, note)
      values (p_app, v_review, coalesce(p_requested_fields, '{}'), btrim(p_reason));
  end if;

  perform ap_private.notify(a.submitted_by, 'application_' || p_decision::text,
    jsonb_build_object('application_id', p_app, 'reason', nullif(btrim(p_reason), '')));
end $$;

-- تسجيل فتح مستند خاص في سجل التدقيق (يُستدعى قبل إنشاء الرابط المؤقت).
create or replace function public.ap_log_document_access(p_doc uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.ap_verification_documents;
begin
  select * into d from public.ap_verification_documents where id = p_doc;
  if not found or not (ap_private.has_permission('accounts.approve') or ap_private.is_org_member(d.organization_id)) then
    raise exception 'ap: forbidden' using errcode = '42501';
  end if;
  perform ap_private.log('document_view', 'ap_verification_documents', p_doc::text, d.organization_id, '{}'::jsonb);
  return d.storage_path;
end $$;

revoke all on function public.ap_admin_create_invitation(text, public.ap_capability[], text, text, int),
  public.ap_admin_revoke_invitation(uuid), public.ap_invitation_lookup(text),
  public.ap_accept_invitation(text, text, text), public.ap_save_application(uuid, jsonb, public.ap_capability[]),
  public.ap_add_document(uuid, text, text, text, text, int, text, date), public.ap_remove_document(uuid),
  public.ap_submit_application(uuid), public.ap_admin_start_review(uuid),
  public.ap_admin_review_application(uuid, public.ap_review_decision, text, public.ap_capability[], text[], text),
  public.ap_log_document_access(uuid) from public, anon;
grant execute on function public.ap_admin_create_invitation(text, public.ap_capability[], text, text, int),
  public.ap_admin_revoke_invitation(uuid), public.ap_invitation_lookup(text),
  public.ap_accept_invitation(text, text, text), public.ap_save_application(uuid, jsonb, public.ap_capability[]),
  public.ap_add_document(uuid, text, text, text, text, int, text, date), public.ap_remove_document(uuid),
  public.ap_submit_application(uuid), public.ap_admin_start_review(uuid),
  public.ap_admin_review_application(uuid, public.ap_review_decision, text, public.ap_capability[], text[], text),
  public.ap_log_document_access(uuid) to authenticated;
-- صفحة الدعوة تُفتح قبل تسجيل الدخول.
grant execute on function public.ap_invitation_lookup(text) to anon;

revoke all on function ap_private.token_hash(text), ap_private.notify(uuid, text, jsonb),
  ap_private.application_editable(uuid), ap_private.application_missing(uuid) from public;
grant execute on function ap_private.application_editable(uuid) to authenticated;
