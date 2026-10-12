// إرسال رسائل SMS وواتساب المصفوفة في private.message_outbox.
// المزوّد من أسرار Supabase (Edge Functions → Secrets):
//   Twilio:   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM (رقم أو اسم مرسل)، TWILIO_WHATSAPP_FROM (مثل +14155238886)
//   Unifonic (SMS فقط): UNIFONIC_APP_SID, UNIFONIC_SENDER_ID
// بلا مزوّد تُعلَّم الرسائل no_provider ولا يُرسل شيء.
// الحماية: x-push-secret نفسه المستخدم لدالة push. منشورة باسم messages (verify_jwt = false).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";

// 05xxxxxxxx أو 5xxxxxxxx أو 9665xxxxxxxx → +9665xxxxxxxx
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{9,15}$/.test(d)) return d;
  if (/^00\d{9,15}$/.test(d)) return `+${d.slice(2)}`;
  if (/^05\d{8}$/.test(d)) return `+966${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `+966${d}`;
  if (/^9665\d{8}$/.test(d)) return `+${d}`;
  return null;
}

type Msg = { id: string; channel: "sms" | "whatsapp"; phone: string; body: string };
type Result = { status: "sent" | "failed" | "no_provider"; error?: string; providerId?: string };

async function viaTwilio(m: Msg, to: string): Promise<Result> {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN");
  const from = m.channel === "whatsapp" ? env("TWILIO_WHATSAPP_FROM") : env("TWILIO_SMS_FROM");
  if (!sid || !token || !from) return { status: "no_provider", error: `TWILIO_${m.channel.toUpperCase()}_NOT_CONFIGURED` };
  const form = new URLSearchParams({ To: m.channel === "whatsapp" ? `whatsapp:${to}` : to, From: m.channel === "whatsapp" ? `whatsapp:${from}` : from, Body: m.body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const out = await res.json().catch(() => ({})) as { sid?: string; message?: string };
  return res.ok ? { status: "sent", providerId: out.sid } : { status: "failed", error: `${res.status} ${out.message ?? ""}`.trim() };
}

async function viaUnifonic(m: Msg, to: string): Promise<Result> {
  const app = env("UNIFONIC_APP_SID"), sender = env("UNIFONIC_SENDER_ID");
  if (m.channel !== "sms" || !app) return { status: "no_provider", error: "UNIFONIC_SMS_ONLY_OR_NOT_CONFIGURED" };
  const form = new URLSearchParams({ AppSid: app, Recipient: to.replace(/^\+/, ""), Body: m.body, ...(sender ? { SenderID: sender } : {}) });
  const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const out = await res.json().catch(() => ({})) as { success?: boolean | string; message?: string; data?: { MessageID?: string | number } };
  const ok = res.ok && String(out.success) === "true";
  return ok ? { status: "sent", providerId: String(out.data?.MessageID ?? "") } : { status: "failed", error: `${res.status} ${out.message ?? ""}`.trim() };
}

async function send(m: Msg): Promise<Result> {
  const to = normalizePhone(m.phone);
  if (!to) return { status: "failed", error: "INVALID_PHONE" };
  try {
    if (env("TWILIO_ACCOUNT_SID")) return await viaTwilio(m, to);
    if (env("UNIFONIC_APP_SID")) return await viaUnifonic(m, to);
    return { status: "no_provider", error: "NO_PROVIDER" };
  } catch (e) {
    return { status: "failed", error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const { data: cfg } = await admin.rpc("push_internal_config");
  if (!cfg || req.headers.get("x-push-secret") !== (cfg as { hook_secret: string }).hook_secret) return json({ error: "FORBIDDEN" }, 403);
  const { data, error } = await admin.rpc("messages_internal_claim", { p_limit: 50 });
  if (error) return json({ error: "CLAIM_FAILED" }, 500);
  const batch = (data ?? []) as Msg[];
  const results = await Promise.all(batch.map(async (m) => {
    const r = await send(m);
    await admin.rpc("messages_internal_result", { p_id: m.id, p_status: r.status, p_error: r.error ?? null, p_provider_id: r.providerId ?? null });
    return r.status;
  }));
  return json({ processed: batch.length, sent: results.filter((s) => s === "sent").length, no_provider: results.filter((s) => s === "no_provider").length });
});
