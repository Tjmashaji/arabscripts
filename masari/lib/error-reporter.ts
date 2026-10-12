import { supabase } from "@/lib/supabase";

// يرسل أخطاء الواجهة غير المعالجة إلى سجل الأعطال (client_errors) ليراها مدير النظام.
// كل رسالة تُرسل مرة واحدة في الجلسة، وتُتجاهل الأخطاء المعروفة غير المؤثرة.
export const APP_VERSION = "2026.10.12";
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed/i, /Failed to fetch/i, /NetworkError/i, /AbortError/i];
let installed = false;

export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const sent = new Set<string>();
  const report = (message: string, stack?: string | null) => {
    const msg = (message || "").slice(0, 500);
    if (!msg || sent.has(msg) || IGNORE.some((r) => r.test(msg))) return;
    sent.add(msg);
    void supabase.rpc("log_client_error", {
      p_message: msg, p_stack: stack?.slice(0, 4000) ?? null, // لا نرسل الـ hash: قد يحوي رموز الدخول (#access_token) أو رابط مشاركة
      p_url: window.location.pathname,
      p_user_agent: navigator.userAgent.slice(0, 300), p_version: APP_VERSION,
    }).then(() => {}, () => {});
  };
  window.addEventListener("error", (e) => report(e.message, e.error instanceof Error ? e.error.stack : null));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : typeof r === "string" ? r : JSON.stringify(r ?? "").slice(0, 300), r instanceof Error ? r.stack : null);
  });
}
