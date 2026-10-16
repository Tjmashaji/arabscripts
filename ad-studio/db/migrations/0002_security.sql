-- العزل والصلاحيات: RLS داخل قاعدة البيانات نفسها.
-- تطبيق الويب يتصل بالدور studio_app، ويضبط app.user_id داخل كل معاملة (انظر src/server/db.ts).
-- إخفاء الأزرار في الواجهة ليس وسيلة حماية؛ هذه السياسات هي خط الدفاع.

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.role_rank(r text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE r WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END
$$;

-- SECURITY DEFINER حتى لا تتكرر السياسات داخل workspace_members نفسها
CREATE OR REPLACE FUNCTION app.is_member(ws uuid, min_role text DEFAULT 'viewer') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
    WHERE m.workspace_id = ws AND m.user_id = app.current_user_id()
      AND app.role_rank(m.role) >= app.role_rank(min_role)
  )
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = app.current_user_id() AND is_admin AND deleted_at IS NULL)
$$;

-- ───────── دوال المصادقة (المنفذ الوحيد للتطبيق إلى بيانات الحسابات قبل تسجيل الدخول) ─────────
CREATE OR REPLACE FUNCTION app.register_user(p_email text, p_name text, p_password_hash text, p_workspace_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid; wid uuid;
BEGIN
  INSERT INTO users (email, name, password_hash) VALUES (lower(trim(p_email)), trim(p_name), p_password_hash)
  RETURNING id INTO uid;
  INSERT INTO workspaces (name, owner_id) VALUES (p_workspace_name, uid) RETURNING id INTO wid;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (wid, uid, 'owner');
  INSERT INTO audit_logs (workspace_id, user_id, action, entity, entity_id) VALUES (wid, uid, 'register', 'user', uid::text);
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION app.login_lookup(p_email text)
RETURNS TABLE (user_id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, password_hash FROM users WHERE email = lower(trim(p_email)) AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION app.create_session(p_user uuid, p_token_hash text, p_user_agent text, p_ttl_seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
  VALUES (p_user, p_token_hash, left(p_user_agent, 300), now() + make_interval(secs => p_ttl_seconds))
$$;

CREATE OR REPLACE FUNCTION app.session_user(p_token_hash text)
RETURNS TABLE (user_id uuid, email text, name text, is_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.email, u.name, u.is_admin
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash AND s.expires_at > now() AND u.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION app.delete_session(p_token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM sessions WHERE token_hash = p_token_hash
$$;

-- حد معدل الطلبات بنافذة ثابتة. يعيد true إذا سُمح بالطلب.
CREATE OR REPLACE FUNCTION app.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
        n integer;
BEGIN
  INSERT INTO rate_limits (bucket, window_start, hits) VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
  RETURNING hits INTO n;
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';
  RETURN n <= p_limit;
END $$;

-- إنفاق المساحة في الشهر الحالي (بالسنت)، يُستخدم قبل قبول أي مهمة مدفوعة
CREATE OR REPLACE FUNCTION app.month_spend_cents(ws uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(CASE entry_type WHEN 'charge' THEN amount_cents WHEN 'refund' THEN -amount_cents ELSE 0 END), 0)::integer
  FROM usage_ledger WHERE workspace_id = ws AND created_at >= date_trunc('month', now())
$$;

-- ───────── تفعيل RLS ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'sessions', 'plans', 'workspaces', 'workspace_members', 'subscriptions', 'brands', 'projects',
    'media_assets', 'creative_briefs', 'scripts', 'scenes', 'ai_jobs', 'scene_generations', 'audio_assets', 'editing_timelines',
    'exports', 'prompt_templates', 'voice_profiles', 'characters', 'usage_ledger', 'audit_logs', 'rate_limits']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY users_self ON users FOR SELECT USING (id = app.current_user_id() OR app.is_admin());
CREATE POLICY users_self_update ON users FOR UPDATE USING (id = app.current_user_id()) WITH CHECK (id = app.current_user_id());

CREATE POLICY plans_read ON plans FOR SELECT USING (true);

CREATE POLICY workspaces_read ON workspaces FOR SELECT USING (app.is_member(id) OR app.is_admin());
CREATE POLICY workspaces_update ON workspaces FOR UPDATE USING (app.is_member(id, 'owner')) WITH CHECK (app.is_member(id, 'owner'));

CREATE POLICY members_read ON workspace_members FOR SELECT USING (app.is_member(workspace_id));
CREATE POLICY members_manage ON workspace_members FOR ALL USING (app.is_member(workspace_id, 'owner')) WITH CHECK (app.is_member(workspace_id, 'owner'));

CREATE POLICY subscriptions_read ON subscriptions FOR SELECT USING (app.is_member(workspace_id) OR app.is_admin());

-- الجداول التي يقرؤها أي عضو ويعدّلها المحرر والمالك فقط
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brands', 'projects', 'media_assets', 'creative_briefs', 'scripts', 'scenes', 'scene_generations',
    'audio_assets', 'editing_timelines', 'exports', 'voice_profiles', 'characters']
  LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.is_member(workspace_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.is_member(workspace_id, ''editor''))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.is_member(workspace_id, ''editor'')) WITH CHECK (app.is_member(workspace_id, ''editor''))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app.is_member(workspace_id, ''editor''))', t || '_delete', t);
  END LOOP;
END $$;

-- المهام: العضو يقرأ، والمحرر ينشئ باسمه فقط. التحديث محصور بعمود طلب الإلغاء عبر صلاحيات الأعمدة أدناه.
CREATE POLICY ai_jobs_read ON ai_jobs FOR SELECT USING (app.is_member(workspace_id) OR app.is_admin());
CREATE POLICY ai_jobs_insert ON ai_jobs FOR INSERT WITH CHECK (app.is_member(workspace_id, 'editor') AND user_id = app.current_user_id() AND status = 'queued');
CREATE POLICY ai_jobs_cancel ON ai_jobs FOR UPDATE USING (app.is_member(workspace_id, 'editor')) WITH CHECK (app.is_member(workspace_id, 'editor'));

CREATE POLICY usage_read ON usage_ledger FOR SELECT USING (app.is_member(workspace_id) OR app.is_admin());

CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (user_id = app.current_user_id() AND (workspace_id IS NULL OR app.is_member(workspace_id)));
CREATE POLICY audit_read ON audit_logs FOR SELECT USING (app.is_member(workspace_id, 'owner') OR app.is_admin());

-- القوالب: قوالب النظام للقراءة للجميع، وقوالب المساحة لأعضائها
CREATE POLICY templates_read ON prompt_templates FOR SELECT USING (workspace_id IS NULL OR app.is_member(workspace_id));
CREATE POLICY templates_write ON prompt_templates FOR INSERT WITH CHECK (workspace_id IS NOT NULL AND app.is_member(workspace_id, 'editor'));
CREATE POLICY templates_update ON prompt_templates FOR UPDATE USING (workspace_id IS NOT NULL AND app.is_member(workspace_id, 'editor')) WITH CHECK (workspace_id IS NOT NULL AND app.is_member(workspace_id, 'editor'));
CREATE POLICY templates_delete ON prompt_templates FOR DELETE USING (workspace_id IS NOT NULL AND app.is_member(workspace_id, 'editor'));

-- sessions وrate_limits: لا سياسات للتطبيق، فلا وصول مباشر إطلاقًا (فقط عبر الدوال أعلاه)

-- ───────── الصلاحيات ─────────
GRANT USAGE ON SCHEMA public, app TO studio_app, studio_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO studio_app, studio_worker;

GRANT SELECT ON users, plans, workspaces, workspace_members, subscriptions, usage_ledger TO studio_app;
GRANT UPDATE (name, password_hash) ON users TO studio_app;
GRANT UPDATE (name, monthly_spend_cap_cents) ON workspaces TO studio_app;
GRANT INSERT, UPDATE, DELETE ON workspace_members TO studio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON brands, projects, media_assets, creative_briefs, scripts, scenes, scene_generations,
  audio_assets, editing_timelines, exports, prompt_templates, voice_profiles, characters TO studio_app;
GRANT SELECT, INSERT ON ai_jobs, audit_logs TO studio_app;
GRANT UPDATE (cancel_requested) ON ai_jobs TO studio_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO studio_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO studio_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO studio_worker;
