import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { pushContent, sendPush, type PushTarget } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// تستدعيه قاعدة البيانات (pg_net) بعد كل إشعار جديد، ومعه أجهزة صاحبه ولغته. محمي بسر مشترك
// (PUSH_WEBHOOK_SECRET هنا = ap_push_webhook_secret في Vault). الرموز المنتهية تُبلَّغ للقاعدة لتُحذف.
function authorized(header: string | null): boolean {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Body = { kind?: unknown; payload?: unknown; locale?: unknown; tokens?: unknown };

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
  const msg = pushContent(body.kind, payload, typeof body.locale === "string" ? body.locale : "ar");

  const results = await Promise.all(targets.map((t) => sendPush(t, msg)));
  const invalid = targets.filter((_, i) => results[i] === "invalid").map((t) => t.token);
  if (invalid.length) {
    const supabase = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await supabase.rpc("ap_push_tokens_invalid", { p_secret: process.env.PUSH_WEBHOOK_SECRET, p_tokens: invalid });
  }
  return Response.json({
    sent: results.filter((r) => r === "sent").length,
    invalid: invalid.length,
    failed: results.filter((r) => r === "failed").length,
  });
}
