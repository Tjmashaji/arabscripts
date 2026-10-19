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

// هل فُتحت الجلسة من رابط «نسيت كلمة المرور»؟ Supabase يضع طريقة الدخول في حقل amr داخل رمز الجلسة.
export function isRecoveryToken(accessToken: string | undefined): boolean {
  const payload = accessToken?.split(".")[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(json.amr) && json.amr.some((m: { method?: string }) => m?.method === "recovery");
  } catch {
    return false;
  }
}
