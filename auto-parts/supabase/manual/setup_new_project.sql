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

-- ═════ 20261021090000_ap_catalog.sql ═════
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

-- ═════ 20261022090000_ap_quotes.sql ═════
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

-- ═════ 20261023090000_ap_shipping.sql ═════
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

-- ═════ 20261024090000_ap_hardening.sql ═════
-- المرحلة E — تشديد: Supabase يمنح anon وauthenticated صلاحية افتراضية على تسلسلات المخطط public.
-- كل الإدراج يتم عبر دوال النظام، فلا حاجة لأن يستهلك المتصفح أي تسلسل (حتى أرقام المعرّفات الداخلية).
do $$
declare r record;
begin
  for r in select c.oid::regclass as seq from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'ap\_%' loop
    execute format('revoke all on sequence %s from anon, authenticated', r.seq);
  end loop;
end $$;
