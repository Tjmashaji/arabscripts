-- تسجيل الشركاء بأنفسهم + إشعار فريق الاعتماد: الصقه كاملًا في SQL Editor لمشروع auto-parts-eu ثم Run (مرة واحدة).
-- كله في معاملة واحدة: إن فشل أي سطر لا يتغير شيء.
begin;

-- تسجيل الشركاء بأنفسهم (بجانب الدعوات): رابط عام /join يفتح حسابًا ثم طلب اعتماد بالمسار نفسه.
-- المنشأة تبدأ معلّقة والصفة «مطلوبة»؛ لا شيء يعمل قبل أن تعتمدها الإدارة (ap_private.org_can كما هو).
-- وعند إرسال أي طلب اعتماد (بدعوة أو بدونها) يصل إشعار لفريق الاعتماد.
-- اختبارات: supabase/tests/partner_self_registration.sql

create or replace function public.ap_partner_self_register(p_legal_name text, p_country_code text,
  p_capabilities public.ap_capability[], p_locale text default 'ar')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_email text; v_org uuid; v_app uuid; v_locale text;
begin
  if uid is null or not ap_private.is_active_user(uid) then raise exception 'ap: not authenticated' using errcode = '42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'ap: email not confirmed' using errcode = '42501'; end if;
  -- حساب واحد = منشأة واحدة؛ من عنده منشأة يكمل طلبها الحالي.
  if exists (select 1 from public.ap_organization_members where user_id = uid and status = 'active') then
    raise exception 'ap: already partner' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_legal_name, ''))) not between 2 and 200 or upper(coalesce(p_country_code, '')) !~ '^[A-Z]{2}$' then
    raise exception 'ap: invalid' using errcode = '22023';
  end if;
  -- الوسيط دور المنصة نفسها؛ يُمنح بالدعوة فقط.
  if coalesce(cardinality(p_capabilities), 0) = 0 or 'broker' = any(p_capabilities) then
    raise exception 'ap: invalid capabilities' using errcode = '22023';
  end if;
  select code into v_locale from public.ap_locales where code = p_locale and enabled;

  insert into public.ap_organizations (legal_name, country_code, preferred_locale, created_by)
    values (btrim(p_legal_name), upper(p_country_code), coalesce(v_locale, 'ar'), uid) returning id into v_org;
  insert into public.ap_organization_members (organization_id, user_id, member_role, added_by) values (v_org, uid, 'owner', uid);
  insert into public.ap_organization_verifications (organization_id, capability)
    select distinct v_org, c from unnest(p_capabilities) c;
  insert into public.ap_partner_applications (organization_id, invitation_id, submitted_by, contact_email)
    values (v_org, null, uid, v_email) returning id into v_app;
  return v_app;
end $$;

revoke all on function public.ap_partner_self_register(text, text, public.ap_capability[], text) from public, anon;
grant execute on function public.ap_partner_self_register(text, text, public.ap_capability[], text) to authenticated;

-- إشعار فريق الاعتماد عند إرسال الطلب أو إعادة إرساله.
create or replace function ap_private.notify_application_submitted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.status in ('submitted_for_review', 'resubmitted') and new.status is distinct from old.status then
    select legal_name into v_name from public.ap_organizations where id = new.organization_id;
    perform ap_private.notify(s.user_id, 'partner_application_submitted',
      jsonb_build_object('application_id', new.id, 'reference', left(coalesce(v_name, ''), 40), 'invited', new.invitation_id is not null))
    from (select distinct sr.user_id from public.ap_staff_roles sr
          join public.ap_roles_permissions rp on rp.role = sr.role and rp.permission = 'accounts.approve'
          where ap_private.is_active_user(sr.user_id)) s;
  end if;
  return new;
end $$;
create trigger ap_partner_applications_notify_staff after update of status on public.ap_partner_applications
  for each row execute function ap_private.notify_application_submitted();
revoke all on function ap_private.notify_application_submitted() from public, anon, authenticated;

commit;

-- تحقق (يجب أن تكون النتيجتان true):
select to_regprocedure('public.ap_partner_self_register(text, text, public.ap_capability[], text)') is not null as self_register,
  exists (select 1 from pg_trigger where tgname = 'ap_partner_applications_notify_staff') as staff_notify;
