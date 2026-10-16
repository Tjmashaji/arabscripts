-- قراءة بيانات ملف واحد بمعرّفه لخدمة الروابط الموقّعة (التوقيع يُتحقق منه في التطبيق قبل الاستدعاء).
-- تُرجع حقول التقديم فقط، لملف غير محذوف.
CREATE OR REPLACE FUNCTION app.signed_asset(p_id uuid)
RETURNS TABLE (storage_key text, mime_type text, original_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT storage_key, mime_type, original_name FROM media_assets WHERE id = p_id AND deleted_at IS NULL
$$;
GRANT EXECUTE ON FUNCTION app.signed_asset(uuid) TO studio_app;
