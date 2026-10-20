-- الصلاحيات وسياسات RLS.
-- trends_app يعمل بهوية تُضبط داخل كل معاملة: app.store_id للتاجر، أو app.admin_id للمسؤول.
-- trends_worker يتجاوز RLS (ويب هوك، مزامنة، ترند) ولا يُستخدم في صفحات التاجر.

CREATE OR REPLACE FUNCTION app.current_store() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.store_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_admin() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.admin_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_admin() IS NOT NULL
$$;

-- يرى الترند: المسؤول، أو متجر نشط وافق على المساهمة ببياناته («شارك لترى»)
CREATE OR REPLACE FUNCTION app.can_view_trends() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1 FROM stores WHERE id = app.current_store() AND status = 'active' AND contributes
  )
$$;

GRANT USAGE ON SCHEMA app TO trends_app, trends_worker;
GRANT USAGE ON SCHEMA public TO trends_app, trends_worker;

-- العامل: كل العمليات على كل الجداول
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trends_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trends_worker;

-- تطبيق الويب: صلاحيات محددة، ثم RLS يحدد الصفوف
GRANT SELECT ON stores, products, order_lines, sync_jobs, trend_runs, trend_items, verification_requests, webhook_events, audit_log TO trends_app;
GRANT UPDATE (contributes, consent_at, updated_at) ON stores TO trends_app;
GRANT DELETE ON products, order_lines TO trends_app;
GRANT INSERT (store_id, kind, number, legal_name, document, document_mime, document_name) ON verification_requests TO trends_app;
GRANT INSERT (actor, action, target, details) ON audit_log TO trends_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO trends_app;
-- لا شيء على store_tokens وadmins وsessions وrate_limits: الوصول عبر دوال SECURITY DEFINER فقط

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY stores_read ON stores FOR SELECT TO trends_app USING (id = app.current_store() OR app.is_admin());
CREATE POLICY stores_consent ON stores FOR UPDATE TO trends_app USING (id = app.current_store()) WITH CHECK (id = app.current_store());

CREATE POLICY products_read ON products FOR SELECT TO trends_app USING (store_id = app.current_store() OR app.is_admin());
CREATE POLICY products_delete ON products FOR DELETE TO trends_app USING (store_id = app.current_store());
CREATE POLICY lines_read ON order_lines FOR SELECT TO trends_app USING (store_id = app.current_store() OR app.is_admin());
CREATE POLICY lines_delete ON order_lines FOR DELETE TO trends_app USING (store_id = app.current_store());
CREATE POLICY jobs_read ON sync_jobs FOR SELECT TO trends_app USING (store_id = app.current_store() OR app.is_admin());

CREATE POLICY runs_read ON trend_runs FOR SELECT TO trends_app USING (app.can_view_trends());
CREATE POLICY items_read ON trend_items FOR SELECT TO trends_app USING (app.can_view_trends());

CREATE POLICY verif_read ON verification_requests FOR SELECT TO trends_app USING (store_id = app.current_store() OR app.is_admin());
CREATE POLICY verif_insert ON verification_requests FOR INSERT TO trends_app WITH CHECK (store_id = app.current_store());

CREATE POLICY webhooks_admin ON webhook_events FOR SELECT TO trends_app USING (app.is_admin());
CREATE POLICY audit_admin ON audit_log FOR SELECT TO trends_app USING (app.is_admin());
CREATE POLICY audit_insert ON audit_log FOR INSERT TO trends_app WITH CHECK (
  actor = 'store:' || coalesce(app.current_store()::text, '-') OR actor = 'admin:' || coalesce(app.current_admin()::text, '-')
);

-- ── الجلسات ─────────────────────────────────────────────────────────────

-- جلسة التاجر تُنشأ فقط بعد نجاح الدخول عبر سلة (العامل هو من يستقبل رد سلة)
CREATE OR REPLACE FUNCTION app.create_store_session(p_store uuid, p_hash text, p_ua text, p_ttl integer) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, app AS $$
  INSERT INTO sessions (token_hash, store_id, user_agent, expires_at) VALUES (p_hash, p_store, left(p_ua, 300), now() + make_interval(secs => p_ttl));
$$;
REVOKE ALL ON FUNCTION app.create_store_session(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_store_session(uuid, text, text, integer) TO trends_worker;

-- بيانات دخول المسؤول للتحقق من كلمة المرور في التطبيق
CREATE OR REPLACE FUNCTION app.admin_credentials(p_email text) RETURNS TABLE (id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT id, password_hash FROM admins WHERE email = lower(trim(p_email));
$$;

CREATE OR REPLACE FUNCTION app.create_admin_session(p_admin uuid, p_hash text, p_ua text, p_ttl integer) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, app AS $$
  INSERT INTO sessions (token_hash, admin_id, user_agent, expires_at) VALUES (p_hash, p_admin, left(p_ua, 300), now() + make_interval(secs => p_ttl));
$$;

CREATE OR REPLACE FUNCTION app.session_identity(p_hash text)
RETURNS TABLE (store_id uuid, store_name text, store_status text, admin_id uuid, admin_name text, admin_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT s.store_id, st.name, st.status, s.admin_id, a.name, a.email
  FROM sessions s
  LEFT JOIN stores st ON st.id = s.store_id
  LEFT JOIN admins a ON a.id = s.admin_id
  WHERE s.token_hash = p_hash AND s.expires_at > now()
    -- متجر حذف التطبيق: تسقط جلساته
    AND (s.store_id IS NULL OR st.status = 'active');
$$;

CREATE OR REPLACE FUNCTION app.delete_session(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, app AS $$
  DELETE FROM sessions WHERE token_hash = p_hash;
$$;

CREATE OR REPLACE FUNCTION app.hit_rate_limit(p_bucket text, p_limit integer, p_window integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window) * p_window);
  n integer;
BEGIN
  INSERT INTO rate_limits (bucket, window_start, hits) VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
  RETURNING hits INTO n;
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';
  RETURN n <= p_limit;
END $$;

-- ── التوثيق ─────────────────────────────────────────────────────────────

-- قرار المسؤول على طلب التوثيق، مع تحديث حالة المتجر وسجل التدقيق في نفس المعاملة
CREATE OR REPLACE FUNCTION app.review_verification(p_id uuid, p_approve boolean, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE r verification_requests;
BEGIN
  IF NOT app.is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM verification_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'request is not pending' USING ERRCODE = 'P0002'; END IF;
  UPDATE verification_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewer_note = nullif(trim(p_note), ''), reviewed_by = app.current_admin(), reviewed_at = now()
   WHERE id = p_id;
  UPDATE stores
     SET verification_status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
         verified_at = CASE WHEN p_approve THEN now() ELSE NULL END,
         verified_legal_name = CASE WHEN p_approve THEN r.legal_name ELSE NULL END,
         updated_at = now()
   WHERE id = r.store_id;
  INSERT INTO audit_log (actor, action, target, details)
  VALUES ('admin:' || app.current_admin(), CASE WHEN p_approve THEN 'verification.approve' ELSE 'verification.reject' END,
          'store:' || r.store_id, jsonb_build_object('request', p_id, 'note', p_note));
END $$;

-- عند تقديم طلب توثيق تصبح حالة المتجر «قيد المراجعة»
CREATE OR REPLACE FUNCTION app.on_verification_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  UPDATE stores SET verification_status = 'pending', updated_at = now()
   WHERE id = NEW.store_id AND verification_status <> 'verified';
  RETURN NEW;
END $$;
CREATE TRIGGER verification_insert AFTER INSERT ON verification_requests FOR EACH ROW EXECUTE FUNCTION app.on_verification_insert();

-- صفحة التوثيق العامة: أقل قدر من المعلومات، ولا شيء عن المتاجر غير الموثقة إلا أنها غير موثقة
CREATE OR REPLACE FUNCTION app.public_verification(p_public_id text)
RETURNS TABLE (name text, domain text, verified boolean, verified_at timestamptz, legal_name text, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT name, domain, verification_status = 'verified', verified_at,
         CASE WHEN verification_status = 'verified' THEN verified_legal_name END, status = 'active'
  FROM stores WHERE public_id = p_public_id;
$$;

REVOKE ALL ON FUNCTION app.can_view_trends(), app.admin_credentials(text), app.create_admin_session(uuid, text, text, integer),
  app.session_identity(text), app.delete_session(text), app.hit_rate_limit(text, integer, integer),
  app.review_verification(uuid, boolean, text), app.public_verification(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_view_trends(), app.admin_credentials(text), app.create_admin_session(uuid, text, text, integer),
  app.session_identity(text), app.delete_session(text), app.hit_rate_limit(text, integer, integer),
  app.review_verification(uuid, boolean, text), app.public_verification(text) TO trends_app, trends_worker;
