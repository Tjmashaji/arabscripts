import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { isRecoveryToken } from "@/lib/auth-callback";

// روابط البريد (التفعيل واستعادة كلمة المرور). يدعم ?code= (PKCE) و?token_hash=&type=.
// إن لم يحدد الرابط وجهته، تذهب جلسة الاستعادة إلى صفحة كلمة المرور الجديدة وغيرها إلى «حسابي».
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  let accessToken: string | undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    accessToken = data.session?.access_token;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    accessToken = data.session?.access_token;
  }
  if (!ok) return NextResponse.redirect(new URL("/login?error=confirmFailed", url.origin));

  const recovery = type === "recovery" || isRecoveryToken(accessToken);
  const fallback = recovery ? "/reset-password" : "/account";
  const next = url.searchParams.has("next") ? safeNextPath(url.searchParams.get("next"), fallback) : fallback;
  return NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}confirmed=1`, url.origin));
}
