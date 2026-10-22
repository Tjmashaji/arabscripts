import "server-only";
import { env } from "../env";

// عميل سلة: OAuth (accounts.salla.sa) وواجهة المتجر (api.salla.dev/admin/v2).
// الأخطاء مصنفة لأن المزامنة تتصرف حسب النوع: إعادة المحاولة لاحقًا، أو إيقاف المتجر حتى يعيد الربط.

export type SallaErrorKind = "auth" | "rate_limited" | "server" | "client" | "network";
export class SallaError extends Error {
  constructor(public kind: SallaErrorKind, message: string, public status?: number, public retryAfterSeconds?: number) {
    super(message);
  }
}

export type TokenSet = { access_token: string; refresh_token: string | null; expires_at: Date; scope: string | null };

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
// للاختبارات فقط: استبدال الشبكة
export function setFetch(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a));
}

// سلة تعيد expires_in بالثواني في رد OAuth، وexpires كطابع زمني في حدث app.store.authorize
export function tokenSetFrom(raw: Record<string, unknown>, now = Date.now()): TokenSet {
  const access = typeof raw.access_token === "string" ? raw.access_token : "";
  if (!access) throw new SallaError("auth", "رد سلة لا يحتوي رمز وصول");
  const expiresIn = Number(raw.expires_in);
  const expires = Number(raw.expires);
  const expires_at = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(now + expiresIn * 1000)
    : Number.isFinite(expires) && expires > 1e9
      ? new Date(expires * 1000)
      : Number.isFinite(expires) && expires > 0
        ? new Date(now + expires * 1000)
        : new Date(now + 14 * 24 * 3600 * 1000);
  return {
    access_token: access,
    refresh_token: typeof raw.refresh_token === "string" && raw.refresh_token ? raw.refresh_token : null,
    expires_at,
    scope: typeof raw.scope === "string" ? raw.scope : null,
  };
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new SallaError("network", `تعذر الاتصال بسلة: ${(e as Error).message}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ليس JSON (صفحة خطأ من البوابة مثلًا)
  }
  if (res.ok) return json;
  const msg = (json as { error?: { message?: string }; message?: string } | null)?.error?.message ?? (json as { message?: string } | null)?.message ?? res.statusText;
  if (res.status === 401 || res.status === 403) throw new SallaError("auth", `رفضت سلة الصلاحية: ${msg}`, res.status);
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    throw new SallaError("rate_limited", "تجاوزنا حد طلبات سلة مؤقتًا", 429, Number.isFinite(ra) && ra > 0 ? ra : 60);
  }
  if (res.status >= 500) throw new SallaError("server", `خطأ من خادم سلة (${res.status})`, res.status);
  throw new SallaError("client", `طلب مرفوض من سلة (${res.status}): ${msg}`, res.status);
}

function oauthCreds() {
  const e = env();
  if (!e.SALLA_CLIENT_ID || !e.SALLA_CLIENT_SECRET) throw new SallaError("client", "بيانات تطبيق سلة غير مضبوطة (SALLA_CLIENT_ID وSALLA_CLIENT_SECRET)");
  return { id: e.SALLA_CLIENT_ID, secret: e.SALLA_CLIENT_SECRET };
}

export const redirectUri = () => `${env().APP_URL}/api/auth/salla/callback`;

export function authorizeUrl(state: string): string {
  const u = new URL("/oauth2/auth", env().SALLA_ACCOUNTS_URL);
  u.search = new URLSearchParams({
    client_id: oauthCreds().id,
    response_type: "code",
    redirect_uri: redirectUri(),
    // offline_access يعيد رمز تجديد؛ بقية الصلاحيات تُضبط في بوابة الشركاء
    scope: "offline_access",
    state,
  }).toString();
  return u.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = oauthCreds();
  const json = await call(new URL("/oauth2/token", env().SALLA_ACCOUNTS_URL).toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }).toString(),
  });
  return tokenSetFrom((json ?? {}) as Record<string, unknown>);
}

export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

// رمز التجديد يُستخدم مرة واحدة فقط: استخدامه مرتين يلغي الربط كله، لذلك يُستدعى هذا داخل قفل على صف المتجر (انظر tokens.ts)
export const refreshTokens = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export type MerchantInfo = { merchantId: number; name: string; domain: string | null; email: string | null };

export async function userInfo(accessToken: string): Promise<MerchantInfo> {
  const json = (await call(new URL("/oauth2/user/info", env().SALLA_ACCOUNTS_URL).toString(), {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  })) as { data?: { email?: string; merchant?: { id?: number | string; name?: string; domain?: string } } } | null;
  const m = json?.data?.merchant;
  const merchantId = Number(m?.id);
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new SallaError("client", "لم تُرجع سلة رقم المتجر");
  return { merchantId, name: m?.name?.trim() || "متجر سلة", domain: m?.domain ?? null, email: json?.data?.email ?? null };
}

export type Page<T> = { data: T[]; currentPage: number; totalPages: number };

export async function getPage<T = unknown>(accessToken: string, path: string, query: Record<string, string | number> = {}): Promise<Page<T>> {
  const u = new URL(env().SALLA_API_URL.replace(/\/+$/, "") + path);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  const json = (await call(u.toString(), { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } })) as {
    data?: unknown;
    pagination?: { currentPage?: number; totalPages?: number };
  } | null;
  const data = Array.isArray(json?.data) ? (json!.data as T[]) : json?.data ? [json.data as T] : [];
  const currentPage = Number(json?.pagination?.currentPage) || Number(query.page) || 1;
  const totalPages = Number(json?.pagination?.totalPages) || currentPage;
  return { data, currentPage, totalPages };
}
