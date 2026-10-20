-- صفحات الثقة والتتبع العام: الصقه في SQL Editor لمشروع auto-parts-eu ثم Run.
-- صفحات الثقة والتتبع العام:
-- 1) بيانات التواصل والسجل التجاري إعدادات يعدّلها المدير، ولا تظهر في الموقع إلا إذا أُدخلت (لا بيانات وهمية).
-- 2) تتبع الطلب بلا تسجيل دخول: رقم الطلب + جوال صاحب الطلب كاملًا. يعيد الحالة ومراحل الشحن فقط
--    (لا أسعار ولا أسماء ولا عناوين)، ويقفل التتبع لرقم الطلب بعد 10 محاولات خاطئة في الساعة ضد التخمين.

insert into public.ap_platform_settings (key, value, description, is_public) values
  ('contact_email', '""', 'بريد التواصل الظاهر في تذييل الموقع وصفحة من نحن', true),
  ('contact_whatsapp', '""', 'رقم واتساب للتواصل بصيغة دولية مثل +9665XXXXXXXX', true),
  ('commercial_register', '""', 'رقم السجل التجاري للجهة المشغّلة', true),
  ('legal_entity_name', '""', 'الاسم النظامي للجهة المشغّلة للمنصة', true)
on conflict (key) do nothing;

create table ap_private.track_attempts (
  reference text not null,
  attempted_at timestamptz not null default now()
);
create index track_attempts_idx on ap_private.track_attempts (reference, attempted_at);
revoke all on ap_private.track_attempts from public, anon, authenticated;
-- طبقة إضافية: المخطط غير منشور عبر API أصلًا، والدالة (مالكة الجدول) تتجاوز RLS.
alter table ap_private.track_attempts enable row level security;

create or replace function public.ap_track_order(p_reference text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ref text := upper(btrim(coalesce(p_reference, ''))); o record; v_shipment jsonb;
begin
  if v_ref !~ '^ORD-[0-9]{6,}$' or coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  delete from ap_private.track_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from ap_private.track_attempts where reference = v_ref and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'ap: too many attempts' using errcode = 'P0001';
  end if;
  select ord.id, ord.reference, ord.status, ord.created_at into o
  from public.ap_orders ord join public.ap_quote_requests r on r.id = ord.request_id
  where ord.reference = v_ref and r.contact_phone = p_phone;
  if not found then
    insert into ap_private.track_attempts (reference) values (v_ref);
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

revoke all on function public.ap_track_order(text, text) from public;
grant execute on function public.ap_track_order(text, text) to anon, authenticated;
