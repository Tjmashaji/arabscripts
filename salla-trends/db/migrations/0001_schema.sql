-- المخطط الأساسي لمنصة ترند سلة.
-- مبدأ الخصوصية: لا نخزن أي بيانات عملاء (لا أسماء ولا جوالات ولا عناوين)، فقط المدينة لحساب المنطقة.
-- ولا يظهر أي منتج في الترند إلا إذا باعه عدد كافٍ من المتاجر المختلفة (انظر app.compute_trends).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;

-- المتاجر: كل متجر في سلة ثبّت التطبيق
CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salla_merchant_id bigint NOT NULL UNIQUE,
  -- معرف عام عشوائي لصفحة التوثيق والشارة، حتى لا يُكشف المعرف الداخلي
  public_id text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  name text NOT NULL DEFAULT '',
  domain text,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'uninstalled')),
  -- موافقة التاجر على المساهمة ببيانات مبيعاته المجمعة. بدونها لا تُحسب مبيعاته ولا يرى الترند.
  contributes boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_legal_name text,
  installed_at timestamptz NOT NULL DEFAULT now(),
  uninstalled_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- رموز سلة مشفرة (AES-256-GCM في التطبيق). جدول منفصل لا يملك trends_app أي صلاحية عليه.
CREATE TABLE store_tokens (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  expires_at timestamptz NOT NULL,
  scope text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- مسؤولو المنصة (يُنشؤون بسكربت scripts/create-admin.ts)
CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- الجلسات: الكوكي يحمل رمزًا عشوائيًا، والجدول يحمل بصمته فقط
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE CASCADE,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK ((store_id IS NULL) <> (admin_id IS NULL))
);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- كل ويب هوك يصل يُسجَّل أولًا، ثم يُعالج. البصمة تمنع معالجة نفس الحدث مرتين عند إعادة الإرسال.
CREATE TABLE webhook_events (
  id bigserial PRIMARY KEY,
  body_sha256 text NOT NULL UNIQUE,
  event text NOT NULL,
  salla_merchant_id bigint,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);
CREATE INDEX webhook_events_merchant ON webhook_events (salla_merchant_id, received_at DESC);

-- منتجات المتجر كما في سلة، مع بصمة المطابقة بين المتاجر والتصنيف الموحد
CREATE TABLE products (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  salla_product_id bigint NOT NULL,
  name text NOT NULL,
  sku text,
  gtin text,
  category_names text[] NOT NULL DEFAULT '{}',
  taxonomy text NOT NULL DEFAULT 'other',
  fingerprint text NOT NULL,
  price_halalas bigint,
  status text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, salla_product_id)
);
CREATE INDEX products_fingerprint ON products (fingerprint);

-- سطور الطلبات: منتج واحد في طلب واحد. لا بيانات عميل، فقط المدينة والمنطقة.
CREATE TABLE order_lines (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  salla_order_id bigint NOT NULL,
  line_key text NOT NULL,
  salla_product_id bigint,
  fingerprint text NOT NULL,
  name text NOT NULL,
  taxonomy text NOT NULL DEFAULT 'other',
  quantity integer NOT NULL CHECK (quantity > 0),
  revenue_halalas bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  city text,
  region text,
  country text,
  ordered_at timestamptz NOT NULL,
  status_slug text,
  -- counted: يدخل في الحساب. excluded: ملغي أو مسترجع أو لم يُدفع بعد.
  counted boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, salla_order_id, line_key)
);
CREATE INDEX order_lines_time ON order_lines (ordered_at) WHERE counted;
CREATE INDEX order_lines_store_time ON order_lines (store_id, ordered_at DESC);

-- مهام المزامنة (سحب الطلبات والمنتجات السابقة من سلة)
CREATE TABLE sync_jobs (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sync_store', 'sync_products', 'backfill_orders')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  page integer NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- مهمة واحدة نشطة من كل نوع لكل متجر
CREATE UNIQUE INDEX sync_jobs_one_active ON sync_jobs (store_id, kind) WHERE status IN ('queued', 'running');
CREATE INDEX sync_jobs_due ON sync_jobs (run_after) WHERE status = 'queued';

-- لقطات الترند: كل تشغيل لحساب الترند ينتج دفعة، والواجهة تقرأ أحدث دفعة مكتملة فقط
CREATE TABLE trend_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  as_of timestamptz NOT NULL,
  min_stores integer NOT NULL,
  contributing_stores integer NOT NULL DEFAULT 0,
  items integer NOT NULL DEFAULT 0
);

CREATE TABLE trend_items (
  run_id bigint NOT NULL REFERENCES trend_runs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('best', 'trending')),
  window_days integer NOT NULL CHECK (window_days IN (7, 30)),
  region text NOT NULL,      -- 'ALL' أو رمز المنطقة
  taxonomy text NOT NULL,    -- 'ALL' أو رمز التصنيف
  rank integer NOT NULL,
  fingerprint text NOT NULL,
  display_name text NOT NULL,
  units integer NOT NULL,
  prev_units integer NOT NULL,
  stores_count integer NOT NULL,
  orders_count integer NOT NULL,
  growth numeric,            -- نسبة النمو عن الفترة السابقة (null إذا كانت السابقة صفرًا)
  score numeric NOT NULL,
  median_price_halalas bigint,
  PRIMARY KEY (run_id, kind, window_days, region, taxonomy, rank)
);
CREATE INDEX trend_items_fp ON trend_items (run_id, fingerprint);

-- طلبات التوثيق: السجل التجاري أو وثيقة العمل الحر أو معروف، مع مستند يراجعه المسؤول
CREATE TABLE verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('commercial_register', 'freelance', 'maroof')),
  number text NOT NULL,
  legal_name text NOT NULL,
  document bytea NOT NULL,
  document_mime text NOT NULL CHECK (document_mime IN ('application/pdf', 'image/png', 'image/jpeg')),
  document_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_by uuid REFERENCES admins(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- طلب معلّق واحد فقط لكل متجر
CREATE UNIQUE INDEX verification_one_pending ON verification_requests (store_id) WHERE status = 'pending';

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,       -- 'admin:<id>' أو 'store:<id>' أو 'salla' أو 'system'
  action text NOT NULL,
  target text,
  details jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
