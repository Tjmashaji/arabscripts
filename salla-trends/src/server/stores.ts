import "server-only";
import { decrypt, encrypt } from "./crypto";
import { asWorker, type Tx } from "./db";
import { env } from "./env";
import { refreshTokens, SallaError, type MerchantInfo, type TokenSet } from "./salla/client";

// كل ما يخص ربط المتجر برموز سلة. يعمل بدور العامل فقط، لأن trends_app لا يملك أي صلاحية على store_tokens.

export async function upsertStore(tx: Tx, merchantId: number, info?: Partial<MerchantInfo>): Promise<string> {
  const row = await tx.one<{ id: string }>(
    `INSERT INTO stores (salla_merchant_id, name, domain, email)
     VALUES ($1, coalesce($2, ''), $3, $4)
     ON CONFLICT (salla_merchant_id) DO UPDATE SET
       name = coalesce(nullif($2, ''), stores.name),
       domain = coalesce($3, stores.domain),
       email = coalesce($4, stores.email),
       status = 'active',
       uninstalled_at = NULL,
       -- متجر أعاد التثبيت: يُطلب منه الموافقة على المشاركة من جديد
       installed_at = CASE WHEN stores.status = 'uninstalled' THEN now() ELSE stores.installed_at END,
       updated_at = now()
     RETURNING id`,
    [merchantId, info?.name ?? null, info?.domain ?? null, info?.email ?? null],
  );
  return row!.id;
}

export async function saveTokens(tx: Tx, storeId: string, t: TokenSet) {
  const key = env().TOKEN_ENCRYPTION_KEY;
  await tx.q(
    `INSERT INTO store_tokens (store_id, access_token_enc, refresh_token_enc, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (store_id) DO UPDATE SET access_token_enc = $2,
       refresh_token_enc = coalesce($3, store_tokens.refresh_token_enc), expires_at = $4, scope = coalesce($5, store_tokens.scope), updated_at = now()`,
    [storeId, encrypt(t.access_token, key), t.refresh_token ? encrypt(t.refresh_token, key) : null, t.expires_at, t.scope],
  );
}

// مهام الربط الأولي: بيانات المتجر، ثم المنتجات (للتصنيف والباركود)، ثم الطلبات السابقة
export async function enqueueInitialSync(tx: Tx, storeId: string) {
  await tx.q(
    `INSERT INTO sync_jobs (store_id, kind, run_after)
     SELECT $1, k, now() + make_interval(secs => o) FROM (VALUES ('sync_store', 0), ('sync_products', 0), ('backfill_orders', 30)) v(k, o)
     ON CONFLICT DO NOTHING`,
    [storeId],
  );
}

export async function uninstallStore(tx: Tx, storeId: string) {
  // حذف التطبيق يعني: لا رموز، لا جلسات، ولا بيانات مبيعات تبقى في الحساب
  await tx.q("DELETE FROM store_tokens WHERE store_id = $1", [storeId]);
  await tx.q("DELETE FROM sessions WHERE store_id = $1", [storeId]);
  await tx.q("DELETE FROM order_lines WHERE store_id = $1", [storeId]);
  await tx.q("DELETE FROM products WHERE store_id = $1", [storeId]);
  await tx.q("UPDATE sync_jobs SET status = 'failed', last_error = 'uninstalled', updated_at = now() WHERE store_id = $1 AND status IN ('queued', 'running')", [storeId]);
  await tx.q("UPDATE stores SET status = 'uninstalled', uninstalled_at = now(), contributes = false, consent_at = NULL, updated_at = now() WHERE id = $1", [storeId]);
}

const REFRESH_MARGIN_MS = 24 * 3600 * 1000;

// يعيد رمز وصول صالحًا، ويجدده قبل انتهائه بيوم. القفل FOR UPDATE يضمن أن مهمتين متوازيتين لا تجددان معًا
// (رمز التجديد في سلة يُستخدم مرة واحدة، والاستخدام المزدوج يلغي الربط).
export async function accessTokenFor(storeId: string, now = Date.now()): Promise<string> {
  const key = env().TOKEN_ENCRYPTION_KEY;
  return asWorker(async (tx) => {
    const row = await tx.one<{ access_token_enc: string; refresh_token_enc: string | null; expires_at: Date }>(
      "SELECT access_token_enc, refresh_token_enc, expires_at FROM store_tokens WHERE store_id = $1 FOR UPDATE",
      [storeId],
    );
    if (!row) throw new SallaError("auth", "المتجر غير مربوط بسلة");
    const expires = new Date(row.expires_at).getTime();
    if (expires - now > REFRESH_MARGIN_MS) return decrypt(row.access_token_enc, key);
    if (!row.refresh_token_enc) {
      if (expires > now) return decrypt(row.access_token_enc, key);
      throw new SallaError("auth", "انتهت صلاحية الربط ولا يوجد رمز تجديد. يلزم إعادة تثبيت التطبيق.");
    }
    const fresh = await refreshTokens(decrypt(row.refresh_token_enc, key));
    await saveTokens(tx, storeId, fresh);
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ('system', 'tokens.refresh', $1)", [`store:${storeId}`]);
    return fresh.access_token;
  });
}
