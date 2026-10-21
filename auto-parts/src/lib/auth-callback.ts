// روابط البريد من Supabase قد تصل إلى أي صفحة (عندما يرجع Supabase إلى Site URL بدل /auth/confirm):
// ?code=…، أو ?token_hash=…&type=…، أو ?error_code=… عند انتهاء الرابط. نوجّهها كلها إلى مسار واحد.
export function authCallbackTarget(pathname: string, search: URLSearchParams): string | null {
  if (pathname.startsWith("/auth/")) return null;
  if (search.has("error_code")) return "/login?error=confirmFailed";
  const code = search.get("code");
  const tokenHash = search.get("token_hash");
  const type = search.get("type");
  if (!code && !(tokenHash && type)) return null;

  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (tokenHash && type) {
    params.set("token_hash", tokenHash);
    params.set("type", type);
  }
  const flowId = search.get("sb_flow_id");
  if (flowId) params.set("sb_flow_id", flowId);
  const next = search.get("next");
  if (next) params.set("next", next);
  return `/auth/confirm?${params.toString()}`;
}

type Amr = { method?: string; timestamp?: number }[];

function tokenPayload(accessToken: string | undefined): Record<string, unknown> | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

// هل فُتحت الجلسة من رابط «نسيت كلمة المرور»؟ Supabase يضع طريقة الدخول في حقل amr داخل رمز الجلسة.
export function isRecoveryToken(accessToken: string | undefined): boolean {
  const amr = tokenPayload(accessToken)?.amr;
  return Array.isArray(amr) && amr.some((m: { method?: string }) => m?.method === "recovery");
}

// جلسة استعادة حديثة (خلال ساعة): تغيّر كلمة المرور بلا الحالية. غيرها يحتاج كلمة المرور الحالية،
// فمن يجد جهازًا مفتوحًا أو جلسة مسروقة لا يستولي على الحساب بتغيير كلمة مروره.
export const RECOVERY_WINDOW_SECONDS = 60 * 60;
export function hasFreshRecovery(amr: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Array.isArray(amr)) return false;
  return (amr as Amr).some((m) => m?.method === "recovery" && typeof m.timestamp === "number" && nowSeconds - m.timestamp <= RECOVERY_WINDOW_SECONDS);
}

// البريد داخل رمز رابط البريد، ليُعرض للمستخدم قبل فتح الجلسة (لا يُعتمد عليه للتحقق؛ الخادم يتحقق من الرمز).
export function tokenEmail(accessToken: string | undefined): string | null {
  const email = tokenPayload(accessToken)?.email;
  return typeof email === "string" && email.length <= 320 ? email : null;
}
