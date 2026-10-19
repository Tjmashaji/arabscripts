// ربط قناة يوتيوب عبر OAuth 2.0 من Google (تطبيق ويب). نطلب الرفع وقراءة القناة فقط.
import { ProviderError } from "../providers/types";

export const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";

export type GoogleClient = { clientId: string; clientSecret: string; redirectUri: string };

export function authUrl(c: GoogleClient, state: string) {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent: يضمن إعادة refresh_token حتى عند إعادة الربط
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

async function tokenRequest(params: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new ProviderError(String(e), true, "تعذّر الاتصال بخدمة Google. ستُعاد المحاولة.");
  }
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number; error?: string };
  if (j.error === "invalid_grant") throw new ProviderError("invalid_grant", false, "انتهت صلاحية ربط قناة يوتيوب أو أُلغيت. أعد ربط القناة من الإعدادات.");
  if (!res.ok || !j.access_token) throw new ProviderError(`token ${res.status} ${j.error ?? ""}`, res.status >= 500, "رفضت Google طلب الدخول. تحقق من إعدادات OAuth.");
  return j as { access_token: string; refresh_token?: string; scope: string; expires_in: number };
}

export function exchangeCode(c: GoogleClient, code: string) {
  return tokenRequest({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: "authorization_code" });
}

export async function accessToken(c: GoogleClient, refreshToken: string) {
  return (await tokenRequest({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" })).access_token;
}

export async function revoke(token: string) {
  // إلغاء الرمز لدى Google؛ فشل الإلغاء لا يمنع فصل القناة محليًا
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
}

export async function myChannel(token: string) {
  const res = await fetch(`${API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new ProviderError(`channels ${res.status}`, res.status >= 500, "تعذّر قراءة بيانات القناة من يوتيوب.");
  const j = (await res.json()) as { items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[] };
  const ch = j.items?.[0];
  if (!ch) throw new ProviderError("no channel", false, "هذا الحساب لا يملك قناة يوتيوب. أنشئ قناة أولًا ثم أعد الربط.");
  return { id: ch.id, title: ch.snippet.title, thumbnail: ch.snippet.thumbnails?.default?.url ?? null };
}
