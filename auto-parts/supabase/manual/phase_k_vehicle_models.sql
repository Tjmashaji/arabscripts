-- موديلات السيارات: الصقه في SQL Editor لمشروع auto-parts-eu ثم Run. تشغيله مرة ثانية لا يكرر شيئًا.
begin;

-- موديلات العلامات الخمس المعروفة في السوق السعودي، ليختار العميل سيارته في البحث وطلب القطعة.
-- الأسماء فقط؛ سنوات الإنتاج متروكة فارغة عمدًا (لا نضع سنوات غير مؤكدة) ويضيفها المدير من /admin/catalog،
-- ومنه أيضًا يُعطَّل أي موديل غير مطلوب أو يُضاف غيره. التشغيل المتكرر لا يكرر شيئًا.
insert into public.ap_vehicle_models (brand_id, name, name_ar)
select b.id, m.name, m.name_ar
from (values
  ('chery', 'Tiggo 2 Pro', 'تيقو 2 برو'), ('chery', 'Tiggo 4 Pro', 'تيقو 4 برو'), ('chery', 'Tiggo 7 Pro', 'تيقو 7 برو'),
  ('chery', 'Tiggo 8 Pro', 'تيقو 8 برو'), ('chery', 'Arrizo 5', 'أريزو 5'), ('chery', 'Arrizo 6 Pro', 'أريزو 6 برو'),
  ('chery', 'Arrizo 8', 'أريزو 8'),
  ('changan', 'Alsvin', 'السفن'), ('changan', 'Eado Plus', 'إيدو بلس'), ('changan', 'CS35 Plus', 'CS35 بلس'),
  ('changan', 'CS75 Plus', 'CS75 بلس'), ('changan', 'CS85', 'CS85'), ('changan', 'CS95', 'CS95'),
  ('changan', 'UNI-K', 'يوني كي'), ('changan', 'UNI-T', 'يوني تي'), ('changan', 'UNI-V', 'يوني في'), ('changan', 'Hunter', 'هنتر'),
  ('jetour', 'X70', 'X70'), ('jetour', 'X70 Plus', 'X70 بلس'), ('jetour', 'X90 Plus', 'X90 بلس'), ('jetour', 'Dashing', 'داشينق'),
  ('jetour', 'T2', 'T2'),
  ('geely', 'Emgrand', 'امجراند'), ('geely', 'Coolray', 'كولراي'), ('geely', 'Okavango', 'أوكافانقو'), ('geely', 'Tugella', 'توقيلا'),
  ('geely', 'Monjaro', 'مونجارو'), ('geely', 'Azkarra', 'أزكارا'), ('geely', 'Starray', 'ستاراي'),
  ('haval', 'H6', 'H6'), ('haval', 'Jolion', 'جوليون'), ('haval', 'Dargo', 'دارقو'), ('haval', 'H9', 'H9')
) as m(brand, name, name_ar)
join public.ap_vehicle_brands b on b.slug = m.brand
on conflict (brand_id, name) do nothing;

commit;

-- تحقق: عدد الموديلات لكل علامة
select b.name_ar as العلامة, count(m.id) as الموديلات from public.ap_vehicle_brands b left join public.ap_vehicle_models m on m.brand_id = b.id group by b.name_ar, b.sort_order order by b.sort_order;
