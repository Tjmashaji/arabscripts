import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { parseJobs, vapiCallBody, whatsappVariables, type ContactJob } from "@/lib/contact";

// مفاتيح مساعد التأكيد الآلي: سرية، على الخادم فقط. أي مفتاح ناقص يوقف الجزء الذي يحتاجه دون كسر بقية الموقع.
const secret = (name: string) => process.env[name]?.trim() || null;
export const contactConfig = {
  get workerToken() { return secret("CONTACT_WORKER_TOKEN"); },
  get vapi() {
    const apiKey = secret("VAPI_API_KEY"), phoneNumberId = secret("VAPI_PHONE_NUMBER_ID"), webhookSecret = secret("VAPI_WEBHOOK_SECRET");
    if (!apiKey || !phoneNumberId || !webhookSecret) return null;
    return {
      apiKey, phoneNumberId, webhookSecret,
      model: secret("CONTACT_MODEL") ?? "claude-haiku-5-5",
      voiceId: secret("CONTACT_VOICE") ?? "ar-SA-HamedNeural",
    };
  },
  get whatsapp() {
    const sid = secret("TWILIO_ACCOUNT_SID"), token = secret("TWILIO_AUTH_TOKEN"), from = secret("TWILIO_WHATSAPP_FROM");
    const templates = { quote_ready: secret("TWILIO_TEMPLATE_QUOTE_READY"), order_confirm: secret("TWILIO_TEMPLATE_ORDER_CONFIRM") };
    if (!sid || !token || !from) return null;
    return { sid, token, from, templates };
  },
};

export function sameSecret(given: string | null, expected: string | null): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

// عميل بلا جلسة (دور anon). الدالتان تتحققان من رمز العامل بنفسيهما.
function db() {
  return createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function claimJobs(token: string, limit = 5): Promise<ContactJob[]> {
  const { data, error } = await db().rpc("ap_contact_claim", { p_token: token, p_limit: limit });
  if (error) throw new Error(`claim failed: ${error.message}`);
  return parseJobs(data);
}

type ReportArgs = { job?: string | null; event: string; outcome?: string | null; summary?: string | null; providerRef?: string | null; error?: string | null };
export async function report(token: string, a: ReportArgs): Promise<{ action: string; job?: ContactJob }> {
  const { data, error } = await db().rpc("ap_contact_report", {
    p_token: token, p_job: a.job ?? null, p_event: a.event, p_outcome: a.outcome ?? null, p_summary: a.summary ?? null,
    p_provider_ref: a.providerRef ?? null, p_error: a.error?.slice(0, 500) ?? null,
  });
  if (error) throw new Error(`report failed: ${error.message}`);
  const res = (data ?? {}) as { action?: string; job?: unknown };
  return { action: res.action ?? "ok", job: parseJobs(res.job ? [res.job] : [])[0] };
}

const platformName = () => env.platformName ?? "منصة قطع الغيار";

export async function startCall(job: ContactJob): Promise<string> {
  const vapi = contactConfig.vapi;
  if (!vapi) throw new Error("vapi not configured");
  const body = vapiCallBody(job, {
    platform: platformName(), phoneNumberId: vapi.phoneNumberId, webhookUrl: `${env.siteUrl}/api/contact/webhook`,
    webhookSecret: vapi.webhookSecret, model: vapi.model, voiceId: vapi.voiceId,
  });
  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${vapi.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: unknown };
  if (!res.ok || typeof data.id !== "string") throw new Error(`vapi ${res.status}: ${JSON.stringify(data.message ?? data).slice(0, 300)}`);
  return data.id;
}

// رسالة واتساب بقالب معتمد من Meta (الرسائل التي تبدأها الشركة لا تُرسل إلا بقالب). يعيد false إن لم يُضبط واتساب.
export async function sendWhatsApp(job: ContactJob): Promise<boolean> {
  const wa = contactConfig.whatsapp;
  const template = wa?.templates[job.kind];
  if (!wa || !template) return false;
  const form = new URLSearchParams({
    From: `whatsapp:${wa.from}`, To: `whatsapp:${job.phone}`, ContentSid: template,
    ContentVariables: JSON.stringify(whatsappVariables(job)),
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${wa.sid}:${wa.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`twilio ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return true;
}

// بعد «لم يرد»: رسالة واتساب، وتسجيل النتيجة. فشل الإرسال يُسجَّل ولا يعيد المكالمة.
export async function fallbackToWhatsApp(token: string, job: ContactJob) {
  try {
    if (await sendWhatsApp(job)) await report(token, { job: job.id, event: "whatsapp_sent" });
  } catch (e) {
    console.error("[contact] whatsapp", job.id, e instanceof Error ? e.message : e);
  }
}
