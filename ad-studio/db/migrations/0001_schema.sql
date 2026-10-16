-- المخطط الأساسي لاستوديو الإعلانات الذكي
-- كل جدول يخص مساحة عمل يحمل workspace_id حتى تطبّق سياسات RLS عزل البيانات.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ───────── المستخدمون والجلسات ─────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  password_hash text NOT NULL,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ───────── مساحات العمل ─────────
CREATE TABLE plans (
  code                 text PRIMARY KEY,
  name                 text NOT NULL,
  monthly_price_cents  integer NOT NULL CHECK (monthly_price_cents >= 0),
  included_credits_cents integer NOT NULL DEFAULT 0 CHECK (included_credits_cents >= 0),
  features             jsonb NOT NULL DEFAULT '{}',
  is_active            boolean NOT NULL DEFAULT true
);

CREATE TABLE workspaces (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  owner_id                uuid NOT NULL REFERENCES users(id),
  plan_code               text NOT NULL DEFAULT 'free' REFERENCES plans(code),
  -- سقف إنفاق شهري على المزودين بالسنت، حماية من التكاليف غير المتوقعة
  monthly_spend_cap_cents integer NOT NULL DEFAULT 2000 CHECK (monthly_spend_cap_cents >= 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_owner_idx ON workspaces (owner_id);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_code          text NOT NULL REFERENCES plans(code),
  status             text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'past_due', 'cancelled')),
  payment_provider   text,
  provider_reference text,
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_ws_idx ON subscriptions (workspace_id);

-- ───────── العلامات التجارية والوسائط ─────────
CREATE TABLE brands (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  business_type  text NOT NULL CHECK (business_type IN ('restaurant_cafe', 'real_estate', 'perfume_beauty', 'fashion', 'ecommerce', 'automotive', 'professional_services', 'tourism_hospitality', 'other')),
  description    text NOT NULL DEFAULT '',
  audience       text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  differentiator text NOT NULL DEFAULT '',
  offer          text NOT NULL DEFAULT '',
  contact        text NOT NULL DEFAULT '',
  colors         jsonb NOT NULL DEFAULT '[]',
  logo_asset_id  uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX brands_ws_idx ON brands (workspace_id);

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id     uuid REFERENCES brands(id),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scripting', 'producing', 'editing', 'exported')),
  wizard_step  smallint NOT NULL DEFAULT 1 CHECK (wizard_step BETWEEN 1 AND 6),
  -- إعدادات الإعلان: الأسلوب والمدة والهدف والشخصية والمنصة واللغة والمسار
  settings     jsonb NOT NULL DEFAULT '{}',
  created_by   uuid NOT NULL REFERENCES users(id),
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX projects_ws_idx ON projects (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX projects_brand_idx ON projects (brand_id);

CREATE TABLE media_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  brand_id        uuid REFERENCES brands(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  role            text NOT NULL DEFAULT 'other' CHECK (role IN ('product', 'place', 'logo', 'other', 'generated', 'voice', 'music', 'sfx', 'export')),
  storage_key     text NOT NULL UNIQUE,
  original_name   text NOT NULL DEFAULT '',
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text NOT NULL,
  width           integer,
  height          integer,
  duration_ms     integer,
  analysis_status text NOT NULL DEFAULT 'none' CHECK (analysis_status IN ('none', 'pending', 'done', 'failed', 'unavailable')),
  analysis        jsonb,
  -- مخرجات وضع المحاكاة لا تُعرض أبدًا كنتيجة إنتاج حقيقية
  is_simulated    boolean NOT NULL DEFAULT false,
  -- مصدر الملف وترخيصه (مهم للموسيقى والأصوات)
  license         jsonb NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX media_assets_project_idx ON media_assets (project_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_ws_idx ON media_assets (workspace_id);
ALTER TABLE brands ADD CONSTRAINT brands_logo_fk FOREIGN KEY (logo_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

-- ───────── المخرج الإبداعي: الملخص والسيناريو والمشاهد ─────────
CREATE TABLE creative_briefs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  input        jsonb NOT NULL,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creative_briefs_project_idx ON creative_briefs (project_id, created_at DESC);

CREATE TABLE scripts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief_id     uuid REFERENCES creative_briefs(id) ON DELETE SET NULL,
  version      integer NOT NULL,
  source       text NOT NULL CHECK (source IN ('ai', 'simulation', 'user', 'template')),
  provider     text,
  -- اسم الحملة والفكرة والرسالة والخطاف والتعليق والدعوة والاستمرارية (مخطط director-output)
  content      jsonb NOT NULL,
  is_current   boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE UNIQUE INDEX scripts_one_current ON scripts (project_id) WHERE is_current;

CREATE TABLE scenes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position            integer NOT NULL CHECK (position >= 0),
  title               text NOT NULL DEFAULT '',
  duration_ms         integer NOT NULL CHECK (duration_ms BETWEEN 500 AND 60000),
  visual_prompt       text NOT NULL DEFAULT '',
  negative_prompt     text NOT NULL DEFAULT '',
  camera              text NOT NULL DEFAULT '',
  lighting            text NOT NULL DEFAULT '',
  on_screen_text      text NOT NULL DEFAULT '',
  voiceover           text NOT NULL DEFAULT '',
  sfx                 text NOT NULL DEFAULT '',
  transition          text NOT NULL DEFAULT 'cut' CHECK (transition IN ('cut', 'fade', 'slideleft', 'slideright', 'zoomin', 'dissolve')),
  editing_notes       text NOT NULL DEFAULT '',
  continuity          text NOT NULL DEFAULT '',
  reference_asset_ids uuid[] NOT NULL DEFAULT '{}',
  -- generate: يُولَّد بالذكاء الاصطناعي، upload: مقطع أو صورة مرفوعة، none: لم يُحدد بعد
  source_type         text NOT NULL DEFAULT 'none' CHECK (source_type IN ('generate', 'upload', 'none')),
  selected_asset_id   uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  trim_start_ms       integer NOT NULL DEFAULT 0 CHECK (trim_start_ms >= 0),
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX scenes_project_idx ON scenes (project_id, position) WHERE deleted_at IS NULL;

-- ───────── المهام غير المتزامنة ─────────
CREATE TABLE ai_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id),
  type            text NOT NULL CHECK (type IN ('director', 'analyze_media', 'generate_video', 'generate_image', 'generate_speech', 'export')),
  provider        text NOT NULL,
  provider_job_id text,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  -- null عندما لا يقدّم المزود نسبة تقدم موثوقة؛ عندها يُعرض progress_label فقط
  progress        numeric(5, 2) CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  progress_label  text,
  input           jsonb NOT NULL DEFAULT '{}',
  output          jsonb,
  error           text,
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  idempotency_key text NOT NULL,
  run_after       timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  locked_by       text,
  cancel_requested boolean NOT NULL DEFAULT false,
  is_simulated    boolean NOT NULL DEFAULT false,
  cost_cents      integer CHECK (cost_cents IS NULL OR cost_cents >= 0),
  cost_is_estimate boolean NOT NULL DEFAULT false,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX ai_jobs_queue_idx ON ai_jobs (run_after) WHERE status IN ('queued', 'processing');
CREATE INDEX ai_jobs_project_idx ON ai_jobs (project_id, created_at DESC);
CREATE INDEX ai_jobs_ws_idx ON ai_jobs (workspace_id, created_at DESC);

CREATE TABLE scene_generations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scene_id        uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('video', 'image')),
  provider        text NOT NULL,
  prompt          text NOT NULL,
  params          jsonb NOT NULL DEFAULT '{}',
  result_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  is_simulated    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scene_generations_scene_idx ON scene_generations (scene_id, created_at DESC);

-- مقاطع التعليق الصوتي: جملة أو أكثر لكل مشهد
CREATE TABLE audio_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        uuid REFERENCES scenes(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('voiceover', 'music', 'sfx')),
  text            text NOT NULL DEFAULT '',
  asset_id        uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  job_id          uuid REFERENCES ai_jobs(id) ON DELETE SET NULL,
  voice_profile_id uuid,
  offset_ms       integer NOT NULL DEFAULT 0 CHECK (offset_ms >= 0),
  volume          numeric(4, 2) NOT NULL DEFAULT 1.0 CHECK (volume BETWEEN 0 AND 2),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  is_simulated    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audio_assets_project_idx ON audio_assets (project_id, kind);
CREATE INDEX audio_assets_scene_idx ON audio_assets (scene_id);

-- ───────── المونتاج والتصدير ─────────
CREATE TABLE editing_timelines (
  project_id   uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version      integer NOT NULL DEFAULT 1,
  data         jsonb NOT NULL,
  updated_by   uuid REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL UNIQUE REFERENCES ai_jobs(id) ON DELETE CASCADE,
  asset_id          uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  aspect            text NOT NULL CHECK (aspect IN ('9:16', '16:9', '1:1', '4:5')),
  width             integer,
  height            integer,
  duration_ms       integer,
  timeline_version  integer NOT NULL,
  settings_snapshot jsonb NOT NULL,
  is_simulated      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exports_project_idx ON exports (project_id, created_at DESC);

-- ───────── القوالب والشخصيات والأصوات ─────────
CREATE TABLE prompt_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- null = قالب نظام متاح للجميع (للقراءة فقط)
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  slug            text,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  preview         text NOT NULL DEFAULT '',
  business_types  text[] NOT NULL DEFAULT '{}',
  goals           text[] NOT NULL DEFAULT '{}',
  styles          text[] NOT NULL DEFAULT '{}',
  durations       integer[] NOT NULL DEFAULT '{}',
  platforms       text[] NOT NULL DEFAULT '{}',
  character_types text[] NOT NULL DEFAULT '{}',
  scene_types     text[] NOT NULL DEFAULT '{}',
  required_fields text[] NOT NULL DEFAULT '{}',
  base_prompt     text NOT NULL,
  negative_prompt text NOT NULL DEFAULT '',
  variables       jsonb NOT NULL DEFAULT '[]',
  scene_plan      jsonb NOT NULL DEFAULT '[]',
  editing_notes   text NOT NULL DEFAULT '',
  copied_from     uuid REFERENCES prompt_templates(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX prompt_templates_system_slug ON prompt_templates (slug) WHERE workspace_id IS NULL;
CREATE INDEX prompt_templates_ws_idx ON prompt_templates (workspace_id);

CREATE TABLE voice_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              text NOT NULL,
  provider          text NOT NULL,
  provider_voice_id text NOT NULL,
  language          text NOT NULL DEFAULT 'ar',
  dialect           text NOT NULL DEFAULT 'msa',
  gender            text CHECK (gender IN ('male', 'female', 'neutral')),
  speed             numeric(3, 2) NOT NULL DEFAULT 1.0 CHECK (speed BETWEEN 0.7 AND 1.3),
  tone              text NOT NULL DEFAULT 'calm' CHECK (tone IN ('calm', 'fast', 'energetic', 'luxury')),
  is_favorite       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_profiles_ws_idx ON voice_profiles (workspace_id);

CREATE TABLE characters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name               text NOT NULL,
  type               text NOT NULL CHECK (type IN ('narrator', 'virtual_presenter', 'cartoon', 'ai_human', 'product_only')),
  presentation_style text NOT NULL DEFAULT '',
  appearance         text NOT NULL DEFAULT '',
  wardrobe           text NOT NULL DEFAULT '',
  reference_asset_ids uuid[] NOT NULL DEFAULT '{}',
  voice_profile_id   uuid REFERENCES voice_profiles(id) ON DELETE SET NULL,
  -- إقرار حقوق الاستخدام والموافقة للشخصيات البشرية الواقعية
  rights_confirmed   boolean NOT NULL DEFAULT false,
  is_favorite        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX characters_ws_idx ON characters (workspace_id);

-- ───────── الاستخدام والتدقيق وحدود الطلبات ─────────
CREATE TABLE usage_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id       uuid REFERENCES ai_jobs(id) ON DELETE SET NULL,
  entry_type   text NOT NULL CHECK (entry_type IN ('charge', 'grant', 'refund')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  provider     text,
  is_estimate  boolean NOT NULL DEFAULT false,
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- قيد يمنع احتساب نفس المهمة مرتين
CREATE UNIQUE INDEX usage_ledger_job_once ON usage_ledger (job_id, entry_type) WHERE job_id IS NOT NULL;
CREATE INDEX usage_ledger_ws_idx ON usage_ledger (workspace_id, created_at DESC);

CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  meta         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_ws_idx ON audit_logs (workspace_id, created_at DESC);

CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'workspaces', 'subscriptions', 'brands', 'projects', 'scenes', 'ai_jobs', 'audio_assets', 'prompt_templates', 'voice_profiles', 'characters']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t, t);
  END LOOP;
END $$;
