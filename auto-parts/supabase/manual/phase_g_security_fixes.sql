-- إصلاحات المراجعة الأمنية: الصقه كاملًا في SQL Editor لمشروع auto-parts-eu ثم Run (مرة واحدة).
-- كله في معاملة واحدة: إن فشل أي سطر لا يتغير شيء.
begin;

-- إصلاحات المراجعة الأمنية (أكتوبر 2026). كل بند مرتبط باختبار في supabase/tests/security_fixes.sql.

-- ───────── 1) عرض المورد يُقفل لحظة بناء التسعيرة عليه، ولا تصدر تسعيرة على عرض منتهٍ ─────────
-- كان المورد يستطيع تعديل سعره ونوع القطعة بعد أن بنت الإدارة التسعيرة عليه (قبل الإصدار)، فيختلف ما يراه عما دفعه العميل.
create or replace function ap_private.lock_supplier_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.supplier_quote_id is not null and new.supplier_quote_id is distinct from old.supplier_quote_id then
    update public.ap_supplier_quotes set status = 'selected' where id = new.supplier_quote_id and status = 'submitted';
  end if;
  return new;
end $$;
create trigger ap_customer_quotes_lock_supplier after insert or update of supplier_quote_id on public.ap_customer_quotes
  for each row execute function ap_private.lock_supplier_quote();

create or replace function ap_private.guard_quote_issue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'issued' and old.status = 'draft' then
    if exists (select 1 from public.ap_customer_quote_lines where quote_id = new.id and code in ('international_shipping', 'local_shipping')
               group by code having count(*) > 1) then
      raise exception 'ap: shipping counted twice' using errcode = '22023';
    end if;
    if new.supplier_quote_id is not null and not exists (select 1 from public.ap_supplier_quotes s where s.id = new.supplier_quote_id
               and s.status = 'selected' and s.valid_until > now()) then
      raise exception 'ap: supplier quote not usable' using errcode = '22023';
    end if;
    if new.shipping_quote_id is not null and not exists (select 1 from public.ap_shipping_quotes s where s.id = new.shipping_quote_id
               and s.status = 'selected' and s.valid_until > now()) then
      raise exception 'ap: shipping quote not usable' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- ───────── 2) مستندات الشحنة: قراءة الملف تتبع صلاحية سجل المستند نفسه ─────────
-- كان العميل يقرأ كل ملفات مجلد الشحنة من التخزين (بوليصة، أخرى) رغم أن الجدول يحصره في إثبات التسليم والفاتورة.
drop policy ap_shipment_docs_storage_read on storage.objects;
create policy ap_shipment_docs_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'ap-shipment-docs' and (
    exists (select 1 from public.ap_shipment_documents d where d.storage_path = name)
    -- من يرفع (العمليات والناقل المسند) يقرأ مجلد الشحنة كما كان، فالرفع لا يتعطل قبل تسجيل المستند.
    or exists (select 1 from public.ap_shipments s where s.id = ((storage.foldername(name))[1])::uuid
      and (ap_private.has_permission('shipping.manage') or ap_private.has_permission('orders.manage_all')
           or ap_private.carrier_member(s.carrier_id)))));

-- ───────── 3) صور طلب التسعير لا تصل للمورد إلا بقرار صريح من الإدارة ─────────
-- صورة اللوحة قد تكشف رقم الهيكل حتى عند عدم مشاركته.
alter table public.ap_quote_request_suppliers add column share_media boolean not null default false;

create or replace function ap_private.request_media_org(p_request uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.organization_id from public.ap_quote_request_suppliers s
  where s.request_id = p_request and s.share_media and ap_private.is_org_member(s.organization_id) and ap_private.org_can_sell(s.organization_id)
  order by s.invited_at limit 1 $$;
revoke all on function ap_private.request_media_org(uuid) from public;
grant execute on function ap_private.request_media_org(uuid) to authenticated;

drop policy ap_request_media_storage_read on storage.objects;
create policy ap_request_media_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'ap-request-media' and (
    ap_private.has_permission('quotes.manage')
    or ((storage.foldername(name))[1] = (select auth.uid())::text)
    or ap_private.request_media_org(((storage.foldername(name))[2])::uuid) is not null));

drop function public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean);
create function public.ap_admin_send_request_to_suppliers(p_request uuid, p_orgs uuid[], p_share_vin boolean default false,
  p_share_media boolean default false)
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
    insert into public.ap_quote_request_suppliers (request_id, organization_id, share_vin, share_media, invited_by)
      values (p_request, v_org, coalesce(p_share_vin, false), coalesce(p_share_media, false), auth.uid())
      on conflict (request_id, organization_id) do update set share_vin = excluded.share_vin, share_media = excluded.share_media
      returning (xmax = 0) into v_new;
    if v_new then perform ap_private.notify(m.user_id, 'quote_request_invited', jsonb_build_object('request_id', p_request, 'reference', r.reference))
      from public.ap_organization_members m where m.organization_id = v_org and m.status = 'active'; end if;
    n := n + 1;
  end loop;
  update public.ap_quote_requests set status = 'sourcing' where id = p_request and status in ('submitted', 'reviewing');
  return n;
end $$;
revoke all on function public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean, boolean) from public, anon;
grant execute on function public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean, boolean) to authenticated;

create or replace function public.ap_supplier_requests(p_request uuid default null)
returns table (id uuid, reference text, organization_id uuid, status public.ap_quote_request_status, brand_id uuid, model_id uuid,
  vehicle_year int, engine text, vin text, part_number text, description text, quantity int, city text, product_id uuid,
  invited_at timestamptz, media_count int, my_quote_id uuid, my_quote_status public.ap_supplier_quote_status)
language sql stable security definer set search_path = '' as $$
  select r.id, r.reference, s.organization_id, r.status, r.brand_id, r.model_id, r.vehicle_year, r.engine,
    case when s.share_vin then r.vin end, r.part_number, r.description, r.quantity, r.city, r.product_id, s.invited_at,
    case when s.share_media then (select count(*)::int from public.ap_quote_request_media m where m.request_id = r.id) else 0 end,
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
declare v_org uuid := ap_private.request_media_org(p_request);
begin
  if v_org is null then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  perform ap_private.log('request_media_view', 'ap_quote_requests', p_request::text, v_org, '{}'::jsonb);
  return query select m.id, m.storage_path from public.ap_quote_request_media m where m.request_id = p_request order by m.created_at;
end $$;

-- ───────── 4) ملاحظات الإدارة الداخلية في جدول منفصل لا يقرؤه العميل ─────────
create table public.ap_quote_request_notes (
  request_id uuid primary key references public.ap_quote_requests (id) on delete cascade,
  notes text not null check (char_length(notes) <= 2000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ap_quote_request_notes (request_id, notes)
  select id, admin_notes from public.ap_quote_requests where admin_notes is not null;
alter table public.ap_quote_requests drop column admin_notes;
revoke all on public.ap_quote_request_notes from anon, authenticated;
grant select on public.ap_quote_request_notes to authenticated;
alter table public.ap_quote_request_notes enable row level security;
create policy ap_quote_request_notes_read on public.ap_quote_request_notes for select to authenticated
  using (ap_private.has_permission('quotes.manage'));
create trigger ap_quote_request_notes_audit after insert or update or delete on public.ap_quote_request_notes
  for each row execute function ap_private.audit_row();

create or replace function public.ap_admin_update_request_status(p_request uuid, p_status public.ap_quote_request_status,
  p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if p_status not in ('reviewing', 'sourcing', 'expired', 'cancelled') then raise exception 'ap: invalid status' using errcode = '22023'; end if;
  update public.ap_quote_requests set status = p_status
    where id = p_request and status not in ('accepted', 'declined', 'cancelled', 'expired');
  if not found then raise exception 'ap: request closed' using errcode = 'P0001'; end if;
  if nullif(btrim(p_notes), '') is not null then
    insert into public.ap_quote_request_notes (request_id, notes, updated_by) values (p_request, btrim(p_notes), auth.uid())
    on conflict (request_id) do update set notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  end if;
  if p_status in ('expired', 'cancelled') then
    update public.ap_customer_quotes set status = 'superseded' where request_id = p_request and status in ('draft', 'issued');
  end if;
end $$;

-- مصدر البند والمستفيد منه (قد يحويان تكلفة الناقل الأصلية وسعر الصرف) داخليان: العميل يقرأ بقية الأعمدة فقط.
revoke select on public.ap_customer_quote_lines from authenticated;
grant select (id, quote_id, code, description, quantity, unit_amount, amount, status, valid_until, sort_order)
  on public.ap_customer_quote_lines to authenticated;
create or replace function public.ap_admin_quote_line_details(p_request uuid)
returns table (id uuid, source text, beneficiary text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ap_private.has_permission('quotes.manage') then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  return query select l.id, l.source, l.beneficiary from public.ap_customer_quote_lines l
    join public.ap_customer_quotes q on q.id = l.quote_id where q.request_id = p_request;
end $$;
revoke all on function public.ap_admin_quote_line_details(uuid) from public, anon;
grant execute on function public.ap_admin_quote_line_details(uuid) to authenticated;

-- ───────── 5) الناقل لا يقفز مراحل الشحنة ─────────
-- لا تسليم مباشر من «مسندة»: القبول ثم الاستلام من المورد إلزاميان للناقل، والإرجاع فقط بعد الاستلام.
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
  if v_source = 'carrier' and v_new_rank is not null and v_rank < 3 and v_new_rank > v_rank + 1 then
    raise exception 'ap: transition not allowed' using errcode = 'P0001';
  end if;
  if p_status = 'returned' and v_rank < 3 then raise exception 'ap: transition not allowed' using errcode = 'P0001'; end if;
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

-- ───────── 6) تتبع الطلب: حد لكل جوال (يمنع حصر طلبات رقم معروف) وحد أعلى لكل طلب ─────────
-- كان قفل الطلب بعد 10 محاولات يسمح لأي شخص بتعطيل تتبع طلبات غيره، ولا شيء يمنع تجربة رقم جوال معروف على كل الطلبات.
alter table ap_private.track_attempts add column phone_hash text;
create index track_attempts_phone_idx on ap_private.track_attempts (phone_hash, attempted_at);

create or replace function public.ap_track_order(p_reference text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ref text := upper(btrim(coalesce(p_reference, ''))); v_phone text; o record; v_shipment jsonb;
begin
  if v_ref !~ '^ORD-[0-9]{6,}$' or coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  v_phone := encode(extensions.digest(convert_to(p_phone, 'UTF8'), 'sha256'), 'hex');
  delete from ap_private.track_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from ap_private.track_attempts where phone_hash = v_phone and attempted_at > now() - interval '1 hour') >= 10
     or (select count(*) from ap_private.track_attempts where reference = v_ref and attempted_at > now() - interval '1 hour') >= 50 then
    raise exception 'ap: too many attempts' using errcode = 'P0001';
  end if;
  select ord.id, ord.reference, ord.status, ord.created_at into o
  from public.ap_orders ord join public.ap_quote_requests r on r.id = ord.request_id
  where ord.reference = v_ref and r.contact_phone = p_phone;
  if not found then
    insert into ap_private.track_attempts (reference, phone_hash) values (v_ref, v_phone);
    return null;
  end if;
  select jsonb_build_object('reference', s.reference, 'status', s.status, 'carrier', coalesce(s.carrier_name, org.trade_name, org.legal_name),
      'tracking_number', s.tracking_number, 'estimated_delivery_at', s.estimated_delivery_at, 'delivered_at', s.delivered_at,
      'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'location', e.location, 'occurred_at', e.occurred_at)
                          order by e.occurred_at) from public.ap_shipment_events e where e.shipment_id = s.id), '[]'::jsonb))
    into v_shipment
  from public.ap_shipments s left join public.ap_organizations org on org.id = s.carrier_id
  where s.order_id = o.id order by s.created_at desc limit 1;
  return jsonb_build_object('reference', o.reference, 'status', o.status, 'created_at', o.created_at, 'shipment', v_shipment);
end $$;

-- ───────── 7) سجل التدقيق: صفوف فيها بيانات شخصية لمن يملك customers.read فقط ─────────
drop policy ap_audit_logs_read on public.ap_audit_logs;
create policy ap_audit_logs_read on public.ap_audit_logs for select to authenticated
  using (ap_private.has_permission('audit.read') and (
    entity_type not in ('ap_quote_requests', 'ap_shipments', 'ap_profiles', 'ap_partner_applications', 'ap_invitations',
                        'ap_quote_request_notes')
    or ap_private.has_permission('customers.read')));

-- ───────── 8) بيانات المنشآت لأدوار التشغيل فقط (لا للدعم الفني) ─────────
create or replace function ap_private.is_back_office() returns boolean
language sql stable security definer set search_path = '' as $$
  select ap_private.has_permission('accounts.approve') or ap_private.has_permission('products.publish')
      or ap_private.has_permission('quotes.manage') or ap_private.has_permission('orders.manage_all')
      or ap_private.has_permission('shipping.manage') or ap_private.has_permission('finance.manage')
      or ap_private.has_permission('settings.edit') or ap_private.has_permission('roles.manage') $$;
revoke all on function ap_private.is_back_office() from public;
grant execute on function ap_private.is_back_office() to anon, authenticated;

drop policy ap_organizations_read on public.ap_organizations;
create policy ap_organizations_read on public.ap_organizations for select to authenticated
  using (ap_private.is_org_member(id) or ap_private.is_back_office());
drop policy ap_org_members_read on public.ap_organization_members;
create policy ap_org_members_read on public.ap_organization_members for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_back_office());
drop policy ap_org_verifications_read on public.ap_organization_verifications;
create policy ap_org_verifications_read on public.ap_organization_verifications for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_back_office());
drop policy ap_carrier_services_read on public.ap_carrier_services;
create policy ap_carrier_services_read on public.ap_carrier_services for select to authenticated
  using (ap_private.is_org_member(organization_id) or ap_private.is_back_office());
drop policy ap_settings_read on public.ap_platform_settings;
create policy ap_settings_read on public.ap_platform_settings for select to anon, authenticated
  using (is_public or ap_private.is_back_office());

-- ───────── 9) تشديدات صغيرة ─────────
-- الحساب الموقوف لا يعدّل تفضيلاته.
drop policy ap_prefs_update_own on public.ap_user_preferences;
create policy ap_prefs_update_own on public.ap_user_preferences for update to authenticated
  using (user_id = (select auth.uid()) and ap_private.is_active_user((select auth.uid())))
  with check (user_id = (select auth.uid()));
-- حد المستندات في التخزين = حد التطبيق (4 ميجابايت).
update storage.buckets set file_size_limit = 4194304 where id = 'ap-verification-docs';
-- الزائر لا يقرأ هوية من أنشأ المنتج أو راجعه ولا ملاحظات المراجعة.
revoke select on public.ap_products from anon;
grant select (id, name, description, status, brand_id, category_id, original_language, created_at, updated_at) on public.ap_products to anon;

commit;
