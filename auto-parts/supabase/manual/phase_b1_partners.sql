-- المرحلة B1 (الشركاء): الصقه كاملًا في SQL Editor لمشروع auto-parts ثم Run (مرة واحدة).
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
