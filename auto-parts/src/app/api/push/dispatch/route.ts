import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { notificationEmailContent, pushContent, sendPush, type PushTarget } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// تستدعيه قاعدة البيانات (pg_net) بعد كل إشعار جديد، ومعه أجهزة صاحبه وبريده المؤكد ولغته. محمي بسر مشترك
// (PUSH_WEBHOOK_SECRET هنا = ap_push_webhook_secret في Vault). الرموز المنتهية تُبلَّغ للقاعدة لتُحذف.
function authorized(header: string | null): boolean {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Body = { id?: unknown; kind?: unknown; payload?: unknown; locale?: unknown; tokens?: unknown; email?: unknown };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-push-secret"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof body.kind !== "string" || !Array.isArray(body.tokens)) return Response.json({ error: "bad request" }, { status: 400 });
  const targets = (body.tokens as PushTarget[])
    .filter((t) => t && typeof t.token === "string" && (t.platform === "android" || t.platform === "ios"))
    .slice(0, 10);
  const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
  const locale = typeof body.locale === "string" ? body.locale : "ar";
  const msg = pushContent(body.kind, payload, locale);
  const email = typeof body.email === "string" && body.email.length <= 254 && emailPattern.test(body.email) ? body.email : null;

  // البريد بمفتاح منع التكرار من رقم الإشعار: إعادة المحاولة من القاعدة لا ترسل رسالتين.
  const mailing = email
    ? sendEmail({ to: email, ...notificationEmailContent(body.kind, payload, locale),
        idempotencyKey: typeof body.id === "string" || typeof body.id === "number" ? `notification-${body.id}` : undefined })
    : null;
  const results = await Promise.all(targets.map((t) => sendPush(t, msg)));
  const mailed = mailing ? await mailing : null;
  if (mailed && !mailed.ok && mailed.error !== "not_configured") console.error("notification email failed", mailed.error);
  const invalid = targets.filter((_, i) => results[i] === "invalid").map((t) => t.token);
  if (invalid.length) {
    const supabase = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await supabase.rpc("ap_push_tokens_invalid", { p_secret: process.env.PUSH_WEBHOOK_SECRET, p_tokens: invalid });
  }
  return Response.json({
    sent: results.filter((r) => r === "sent").length,
    invalid: invalid.length,
    failed: results.filter((r) => r === "failed").length,
    email: mailed === null ? "none" : mailed.ok ? "sent" : "failed",
  });
}
