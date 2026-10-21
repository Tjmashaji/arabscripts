import { NextResponse } from "next/server";
import { OUTCOME_TOOL, parseVapiMessage } from "@/lib/contact";
import { bearer, contactConfig, fallbackToWhatsApp, report, sameSecret } from "@/lib/contact-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// أحداث Vapi: نتيجة المكالمة من أداة record_outcome، وتقرير نهاية المكالمة (لم يرد ← واتساب).
// السر يصل في ترويسة Authorization التي يضعها جسم المكالمة (vapiCallBody).
export async function POST(req: Request) {
  const vapi = contactConfig.vapi, token = contactConfig.workerToken;
  if (!vapi || !token) return NextResponse.json({ error: "calls not configured" }, { status: 503 });
  if (!sameSecret(bearer(req) ?? req.headers.get("x-vapi-secret"), vapi.webhookSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const events = parseVapiMessage(await req.json().catch(() => null));
  const results: { name: string; toolCallId: string; result: string }[] = [];

  for (const ev of events) {
    try {
      if (ev.type === "outcome") {
        await report(token, { event: "answered", providerRef: ev.callId, outcome: ev.outcome, summary: ev.summary });
        results.push({ name: OUTCOME_TOOL, toolCallId: ev.toolCallId, result: "تم تسجيل النتيجة" });
      } else if (ev.type === "ended") {
        // مكالمة رد عليها العميل وسُجلت نتيجتها: التقرير هنا مكرر ولا يغيّر شيئًا (الدالة تتجاهله).
        const event = ev.result === "answered" ? "answered" : ev.result;
        const res = await report(token, { event, providerRef: ev.callId, outcome: "unclear", summary: ev.summary, error: ev.reason });
        if (res.action === "whatsapp" && res.job) await fallbackToWhatsApp(token, res.job);
      }
    } catch (e) {
      console.error("[contact] webhook", ev.type, e instanceof Error ? e.message : e);
      if (ev.type === "outcome") results.push({ name: OUTCOME_TOOL, toolCallId: ev.toolCallId, result: "تعذّر التسجيل" });
    }
  }
  return NextResponse.json(results.length ? { results } : { ok: true });
}
