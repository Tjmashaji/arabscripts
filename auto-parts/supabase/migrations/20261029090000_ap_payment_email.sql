-- الدفع بالتحويل البنكي والإشعار بالبريد.
-- 1) بيانات الحساب البنكي في إعدادات المنصة (تظهر للعميل على الطلب بانتظار الدفع). فارغة = تبقى رسالة «نتواصل معك».
-- 2) العميل يبلغ عن تحويله برقم المرجع؛ تصل المالية إشعارًا، ثم تسجّل الدفع كما كان (ap_finance_record_payment).
--    البلاغ لا يغيّر حالة الدفع: المالية وحدها تؤكده بعد مطابقة الحساب.
-- 3) كل إشعار يُرسل أيضًا لبريد صاحبه المؤكد عبر نفس مسار الإشعارات (/api/push/dispatch)، والمسار يرسله عبر Resend.
-- اختبارات: supabase/tests/shipping.sql (البلاغ) وsupabase/tests/push.sql (البريد)

insert into public.ap_platform_settings (key, value, description, is_public) values
  ('bank_name', '""', 'اسم البنك لاستقبال التحويلات', true),
  ('bank_account_name', '""', 'اسم صاحب الحساب البنكي كما يظهر للعميل عند التحويل', true),
  ('bank_iban', '""', 'رقم الآيبان السعودي (SA + 22 رقمًا). فارغ = لا تظهر تعليمات التحويل', true)
on conflict (key) do nothing;

alter table public.ap_orders add column payment_reported_at timestamptz;
alter table public.ap_orders add column payment_report text check (char_length(payment_report) <= 120);

-- العميل يبلغ عن تحويل لطلبه بانتظار الدفع (يمكنه تصحيح المرجع قبل تأكيد المالية).
create or replace function public.ap_customer_report_payment(p_order uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.ap_orders; v_ref text := btrim(coalesce(p_reference, '')); m record;
begin
  if auth.uid() is null or not ap_private.is_active_user(auth.uid()) then raise exception 'ap: forbidden' using errcode = '42501'; end if;
  if char_length(v_ref) not between 3 and 120 then raise exception 'ap: invalid reference' using errcode = '22023'; end if;
  select * into o from public.ap_orders where id = p_order for update;
  if not found or o.customer_id is distinct from auth.uid() then raise exception 'ap: order not found' using errcode = 'P0002'; end if;
  if o.status <> 'awaiting_payment' or o.payment_status <> 'unpaid' then raise exception 'ap: order not awaiting payment' using errcode = 'P0001'; end if;
  update public.ap_orders set payment_reported_at = now(), payment_report = v_ref where id = p_order;
  for m in
    select distinct s.user_id from public.ap_staff_roles s join public.ap_roles_permissions p on p.role = s.role
    where p.permission = 'finance.manage' and ap_private.is_active_user(s.user_id)
  loop
    perform ap_private.notify(m.user_id, 'payment_reported', jsonb_build_object('order_id', p_order, 'reference', o.reference));
  end loop;
end $$;

revoke all on function public.ap_customer_report_payment(uuid, text) from public, anon;
grant execute on function public.ap_customer_report_payment(uuid, text) to authenticated;

-- الإرسال: الأجهزة كما كانت، ومعها البريد المؤكد. يُرسل إن وُجد أي منهما.
create or replace function ap_private.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_tokens jsonb; v_locale text; v_email text;
begin
  select nullif(value #>> '{}', '') into v_url from public.ap_platform_settings where key = 'push_webhook_url';
  v_secret := ap_private.push_secret();
  if v_url is null or v_url !~ '^https://' or v_secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('token', token, 'platform', platform)) into v_tokens
    from public.ap_push_tokens where user_id = new.user_id;
  select email into v_email from auth.users where id = new.user_id and email_confirmed_at is not null and email is not null;
  if v_tokens is null and v_email is null then return new; end if;
  select locale into v_locale from public.ap_user_preferences where user_id = new.user_id;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id, 'kind', new.kind, 'payload', new.payload, 'locale', coalesce(v_locale, 'ar'),
      'tokens', coalesce(v_tokens, '[]'::jsonb), 'email', v_email),
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000);
  return new;
exception when others then
  -- الإشعار الفوري والبريد إضافة: فشلهما لا يُفشل العملية الأصلية (الإشعار محفوظ في الصفحة).
  return new;
end $$;
revoke all on function ap_private.dispatch_push() from public, anon, authenticated;
