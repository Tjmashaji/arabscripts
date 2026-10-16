-- خطط الاشتراك (بيانات نظام، ليست بيانات تجريبية). الدفع غير مفعّل حتى تُربط بوابة دفع.
INSERT INTO plans (code, name, monthly_price_cents, included_credits_cents, features) VALUES
  ('free',   'المجانية',   0,     0,     '{"max_projects": 3, "max_export_seconds": 30, "watermark": true}'),
  ('pro',    'الاحترافية', 4900,  2000,  '{"max_projects": 50, "max_export_seconds": 120, "watermark": false}'),
  ('agency', 'الوكالات',   19900, 10000, '{"max_projects": 1000, "max_export_seconds": 180, "watermark": false, "seats": 10}')
ON CONFLICT (code) DO NOTHING;
