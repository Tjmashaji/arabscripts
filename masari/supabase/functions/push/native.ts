// إرسال إشعارات الجوال الأصلية من دالة push:
//   أندرويد: Firebase Cloud Messaging HTTP v1، بحساب خدمة Google (سر FCM_SERVICE_ACCOUNT = ملف JSON كاملًا).
//   الآيفون: Apple Push Notification service مباشرة، بمفتاح .p8 (أسرار APNS_KEY وAPNS_KEY_ID وAPNS_TEAM_ID).
// WebCrypto فقط بلا مكتبات، فيعمل في Deno (Supabase) وفي Node (الاختبارات).

export type PushMessage = { id: string; type: string; title: string; body: string };
export type SendResult = { status: number; remove: boolean; error?: string };
type Fetch = typeof fetch;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array | ArrayBuffer) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));

export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** يوقّع JWT بمفتاح PKCS#8 (RS256 لـ Google، وES256 لـ Apple). */
export async function signJwt(alg: "RS256" | "ES256", header: Record<string, unknown>, claims: Record<string, unknown>, pkcs8Pem: string): Promise<string> {
  const algo = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(pkcs8Pem), algo, false, ["sign"]);
  const input = `${b64urlJson({ alg, typ: "JWT", ...header })}.${b64urlJson(claims)}`;
  const sig = await crypto.subtle.sign(alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${b64url(sig)}`; // ECDSA في WebCrypto يعيد r||s، وهو الشكل الذي يطلبه ES256
}

// ───────── Firebase (أندرويد) ─────────
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let fcmToken: { value: string; exp: number; email: string } | null = null;

export async function fcmAccessToken(sa: ServiceAccount, fetcher: Fetch = fetch, now = Date.now()): Promise<string> {
  if (fcmToken && fcmToken.email === sa.client_email && fcmToken.exp - 60_000 > now) return fcmToken.value;
  const iat = Math.floor(now / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const assertion = await signJwt("RS256", {}, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat, exp: iat + 3600 }, sa.private_key);
  const res = await fetcher(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`FCM_AUTH_${res.status}`);
  fcmToken = { value: data.access_token, exp: now + (data.expires_in ?? 3600) * 1000, email: sa.client_email };
  return data.access_token;
}

export async function sendFcm(token: string, msg: PushMessage, sa: ServiceAccount, fetcher: Fetch = fetch): Promise<SendResult> {
  const access = await fcmAccessToken(sa, fetcher);
  const res = await fetcher(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body },
      data: { id: msg.id, type: msg.type },
      android: { priority: "HIGH", notification: { channel_id: "trips", sound: "default", tag: msg.type } } } }),
  });
  if (res.ok) return { status: res.status, remove: false };
  const text = await res.text().catch(() => "");
  // الرمز لم يعد صالحًا (حُذف التطبيق أو تغيّر الرمز): نحذفه
  const remove = res.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(text);
  return { status: res.status, remove, error: text.slice(0, 200) };
}

// ───────── Apple (الآيفون) ─────────
export type ApnsConfig = { key: string; keyId: string; teamId: string; bundleId: string; sandbox: boolean };
let apnsJwt: { value: string; iat: number; keyId: string } | null = null;

export async function apnsProviderToken(cfg: ApnsConfig, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  // Apple تقبل الرمز ساعة، وترفض تجديده أكثر من مرة كل 20 دقيقة: نعيد استخدامه 50 دقيقة
  if (apnsJwt && apnsJwt.keyId === cfg.keyId && iat - apnsJwt.iat < 3000) return apnsJwt.value;
  const value = await signJwt("ES256", { kid: cfg.keyId }, { iss: cfg.teamId, iat }, cfg.key);
  apnsJwt = { value, iat, keyId: cfg.keyId };
  return value;
}

export async function sendApns(token: string, msg: PushMessage, cfg: ApnsConfig, fetcher: Fetch = fetch): Promise<SendResult> {
  const send = async (sandbox: boolean) => fetcher(`https://${sandbox ? "api.sandbox" : "api"}.push.apple.com/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${await apnsProviderToken(cfg)}`, "apns-topic": cfg.bundleId, "apns-push-type": "alert", "apns-priority": "10", "apns-collapse-id": msg.id.slice(0, 64) },
    body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default" }, id: msg.id, type: msg.type }),
  });
  let res = await send(cfg.sandbox);
  let text = res.ok ? "" : await res.text().catch(() => "");
  // نسخ Xcode التجريبية تستخدم بيئة sandbox ونسخ المتجر وTestFlight الإنتاج: نجرّب الأخرى مرة واحدة
  if (res.status === 400 && /BadDeviceToken/.test(text)) { res = await send(!cfg.sandbox); text = res.ok ? "" : await res.text().catch(() => ""); }
  if (res.ok) return { status: res.status, remove: false };
  const remove = res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text);
  return { status: res.status, remove, error: text.slice(0, 200) };
}

/** يقرأ الأسرار؛ يعيد null للمزوّد غير المضبوط بعد، فتُتجاهل رموزه بدل الفشل. */
export function nativeConfig(env: (k: string) => string | undefined) {
  let fcm: ServiceAccount | null = null;
  try { const raw = env("FCM_SERVICE_ACCOUNT"); if (raw) { const sa = JSON.parse(raw); if (sa.project_id && sa.client_email && sa.private_key) fcm = sa; } } catch { fcm = null; }
  const key = env("APNS_KEY"), keyId = env("APNS_KEY_ID"), teamId = env("APNS_TEAM_ID");
  const apns: ApnsConfig | null = key && keyId && teamId
    ? { key, keyId, teamId, bundleId: env("APNS_BUNDLE_ID") || "sa.masari.app", sandbox: env("APNS_ENV") === "sandbox" } : null;
  return { fcm, apns };
}
