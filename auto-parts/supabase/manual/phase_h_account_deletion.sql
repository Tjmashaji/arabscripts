-- حذف الحساب من داخل المنصة: الصقه كاملًا في SQL Editor لمشروع auto-parts-eu ثم Run (مرة واحدة).
-- كله في معاملة واحدة: إن فشل أي سطر لا يتغير شيء.
begin;

-- حذف الحساب بطلب صاحبه من داخل المنصة (شرط أبل للتطبيقات التي فيها إنشاء حساب، وحق في نظام حماية البيانات الشخصية).
-- يُحذف الحساب وملفه وتفضيلاته وإشعاراته، وتُمحى البيانات الشخصية من طلباته وشحناته ومن سجل التدقيق.
-- تبقى سجلات الطلبات والمدفوعات بلا هوية صاحبها (للمحاسبة والمتطلبات النظامية).
-- اختبارات: supabase/tests/account_deletion.sql

-- ───────── السجلات تبقى بلا صاحب ─────────
alter table public.ap_quote_requests alter column customer_id drop not null,
  alter column contact_name drop not null, alter column contact_phone drop not null;
alter table public.ap_quote_requests drop constraint ap_quote_requests_customer_id_fkey,
  add constraint ap_quote_requests_customer_id_fkey foreign key (customer_id) references public.ap_profiles (user_id) on delete set null;
alter table public.ap_orders alter column customer_id drop not null;
alter table public.ap_orders drop constraint ap_orders_customer_id_fkey,
  add constraint ap_orders_customer_id_fkey foreign key (customer_id) references public.ap_profiles (user_id) on delete set null;
alter table public.ap_shipments alter column recipient_name drop not null, alter column recipient_phone drop not null,
  alter column destination_address drop not null;

-- صاحب الطلب يحذف صور طلباته من التخزين (يستخدمها حذف الحساب قبل استدعاء الدالة).
create policy ap_request_media_storage_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'ap-request-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- يمحو الحقول الشخصية من لقطات سجل التدقيق (old/new) ويُبقي باقي التغيير.
create or replace function ap_private.redact_audit(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select d || jsonb_strip_nulls(jsonb_build_object(
    'old', case when jsonb_typeof(d->'old') = 'object' then (d->'old') - array['contact_name', 'contact_phone', 'vin', 'recipient_name',
      'recipient_phone', 'destination_address', 'full_name', 'phone', 'email', 'notes'] end,
    'new', case when jsonb_typeof(d->'new') = 'object' then (d->'new') - array['contact_name', 'contact_phone', 'vin', 'recipient_name',
      'recipient_phone', 'destination_address', 'full_name', 'phone', 'email', 'notes'] end)) $$;

-- ما يمنع صاحب الحساب من حذفه بنفسه (يعرضه التطبيق قبل أي حذف). null = يمكن الحذف.
-- حسابات الإدارة ومالكو المنشآت يُحذفون عبر الإدارة (لا تبقى منشأة بلا مالك ولا يُفقد آخر مدير).
create or replace function public.ap_account_deletion_blocker()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'forbidden'
    when exists (select 1 from public.ap_staff_roles where user_id = auth.uid()) then 'staff_account'
    when exists (select 1 from public.ap_organization_members where user_id = auth.uid() and member_role = 'owner') then 'organization_owner'
    when exists (select 1 from public.ap_orders where customer_id = auth.uid() and status not in ('completed', 'cancelled', 'refunded'))
      then 'open_orders'
  end $$;

create or replace function public.ap_delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_requests uuid[]; v_shipments uuid[]; v_blocker text := public.ap_account_deletion_blocker();
begin
  if v_blocker = 'forbidden' then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if v_blocker is not null then raise exception 'ap: %', replace(v_blocker, '_', ' ') using errcode = 'P0001'; end if;

  select coalesce(array_agg(id), '{}') into v_requests from public.ap_quote_requests where customer_id = v_uid;
  select coalesce(array_agg(s.id), '{}') into v_shipments
    from public.ap_shipments s join public.ap_orders o on o.id = s.order_id where o.customer_id = v_uid;

  update public.ap_quote_requests set status = 'cancelled'
    where id = any(v_requests) and status in ('submitted', 'reviewing', 'sourcing', 'quoted');
  update public.ap_quote_requests set contact_name = null, contact_phone = null, vin = null where id = any(v_requests);
  delete from public.ap_quote_request_media where request_id = any(v_requests);
  delete from public.ap_quote_request_notes where request_id = any(v_requests);
  update public.ap_shipments set recipient_name = null, recipient_phone = null, destination_address = null where id = any(v_shipments);

  update public.ap_audit_logs set details = ap_private.redact_audit(details)
    where (entity_type = 'ap_quote_requests' and entity_id = any(v_requests::text[]))
       or (entity_type = 'ap_quote_request_notes'
           and coalesce(details->'old'->>'request_id', details->'new'->>'request_id') = any(v_requests::text[]))
       or (entity_type = 'ap_shipments' and entity_id = any(v_shipments::text[]))
       or (entity_type = 'ap_profiles' and entity_id = v_uid::text);
  perform ap_private.log('account_deleted', 'ap_profiles', v_uid::text, null,
    jsonb_build_object('requests', cardinality(v_requests), 'shipments', cardinality(v_shipments)));

  -- يحذف الحساب؛ الملف والتفضيلات والعضويات والإشعارات تُحذف معه، والطلبات تبقى بلا صاحب.
  delete from auth.users where id = v_uid;
end $$;

revoke all on function ap_private.redact_audit(jsonb) from public;
revoke all on function public.ap_delete_my_account(), public.ap_account_deletion_blocker() from public, anon;
grant execute on function public.ap_delete_my_account(), public.ap_account_deletion_blocker() to authenticated;

commit;

-- تحقق (يجب أن تكون كل النتائج true):
select has_table_privilege('auth.users', 'DELETE') as can_delete_users,
  to_regprocedure('public.ap_delete_my_account()') is not null as delete_function,
  to_regprocedure('public.ap_account_deletion_blocker()') is not null as blocker_function;
