-- تحقق (قراءة فقط) أن إصلاحات الأمان كلها مطبّقة. كل صف يجب أن تكون نتيجته true.
select check_name, ok from (values
  ('1 قفل عرض المورد', exists (select 1 from pg_trigger where tgname = 'ap_customer_quotes_lock_supplier')),
  ('1 فحص صلاحية العروض عند الإصدار', pg_get_functiondef('ap_private.guard_quote_issue()'::regprocedure) like '%supplier quote not usable%'),
  ('2 ملفات الشحنة حسب سجل المستند', exists (select 1 from pg_policies where policyname = 'ap_shipment_docs_storage_read' and qual like '%ap_shipment_documents%')),
  ('3 مشاركة الصور', exists (select 1 from information_schema.columns where table_name = 'ap_quote_request_suppliers' and column_name = 'share_media')),
  ('3 دالة الإرسال الجديدة', to_regprocedure('public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean, boolean)') is not null
                            and to_regprocedure('public.ap_admin_send_request_to_suppliers(uuid, uuid[], boolean)') is null),
  ('4 جدول ملاحظات الإدارة', to_regclass('public.ap_quote_request_notes') is not null),
  ('4 حذف admin_notes', not exists (select 1 from information_schema.columns where table_name = 'ap_quote_requests' and column_name = 'admin_notes')),
  ('4 إخفاء مصدر البند عن العميل', not has_column_privilege('authenticated', 'public.ap_customer_quote_lines', 'source', 'select')),
  ('4 دالة تفاصيل البنود', to_regprocedure('public.ap_admin_quote_line_details(uuid)') is not null),
  ('5 الناقل لا يقفز المراحل', pg_get_functiondef('public.ap_update_shipment(uuid, public.ap_shipment_status, text, text, text)'::regprocedure) like '%v_rank + 1%'),
  ('6 حد التتبع لكل جوال', exists (select 1 from information_schema.columns where table_schema = 'ap_private' and table_name = 'track_attempts' and column_name = 'phone_hash')),
  ('7 سجل التدقيق', exists (select 1 from pg_policies where policyname = 'ap_audit_logs_read' and qual like '%customers.read%')),
  ('8 الدعم لا يقرأ المنشآت', exists (select 1 from pg_policies where policyname = 'ap_organizations_read' and qual like '%is_back_office%')),
  ('9 تفضيلات الموقوف', exists (select 1 from pg_policies where policyname = 'ap_prefs_update_own' and qual like '%is_active_user%')),
  ('9 حد ملفات التوثيق', (select file_size_limit from storage.buckets where id = 'ap-verification-docs') = 4194304),
  ('9 الزائر لا يقرأ مالك المنتج', not has_column_privilege('anon', 'public.ap_products', 'organization_id', 'select'))
) t(check_name, ok);
