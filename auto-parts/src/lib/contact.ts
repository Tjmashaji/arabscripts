// مساعد التأكيد الآلي: نص المكالمة وتفسير أحداث Vapi ورسالة واتساب البديلة. منطق خالص بلا شبكة، يُختبر في tests/unit.
export const contactKinds = ["quote_ready", "order_confirm"] as const;
export type ContactKind = (typeof contactKinds)[number];
export const contactStatuses = ["queued", "calling", "answered", "no_answer", "whatsapp_sent", "failed", "cancelled"] as const;
export type ContactStatus = (typeof contactStatuses)[number];
export const contactOutcomes = ["confirmed", "declined", "callback", "unclear"] as const;
export type ContactOutcome = (typeof contactOutcomes)[number];

// ما تعيده ap_contact_claim لكل مكالمة.
export type ContactJob = {
  id: string;
  kind: ContactKind;
  attempt: number;
  phone: string;
  name: string;
  reference: string;
  description: string;
  part_number: string | null;
  quantity: number;
  city: string;
  vehicle: string | null;
  total: number | null;
  currency: string | null;
  valid_until: string | null;
  estimated_delivery_days: number | null;
  has_estimated: boolean | null;
};

export const OUTCOME_TOOL = "record_outcome";

const isOutcome = (v: unknown): v is ContactOutcome => typeof v === "string" && (contactOutcomes as readonly string[]).includes(v);

export function parseJobs(data: unknown): ContactJob[] {
  if (!Array.isArray(data)) return [];
  return data.filter((j): j is ContactJob =>
    !!j && typeof j === "object" && typeof (j as ContactJob).id === "string" && typeof (j as ContactJob).phone === "string"
    && (contactKinds as readonly string[]).includes((j as ContactJob).kind));
}

export function formatAmount(total: number | null, currency: string | null): string | null {
  if (total == null) return null;
  const amount = Number(total).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "SAR" || !currency ? `${amount} ريال` : `${amount} ${currency}`;
}

// التاريخ بتوقيت الرياض، مثل «الخميس 23 أكتوبر».
export function formatDateAr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(d);
}

export function callScript(job: ContactJob, platform: string): { firstMessage: string; systemPrompt: string } {
  const amount = formatAmount(job.total, job.currency);
  const facts = [
    `اسم العميل: ${job.name}`,
    `رقم ${job.kind === "order_confirm" ? "الطلب" : "طلب التسعير"}: ${job.reference}`,
    `القطعة: ${job.description}${job.part_number ? ` (رقم القطعة ${job.part_number})` : ""}`,
    `الكمية: ${job.quantity}`,
    job.vehicle ? `السيارة: ${job.vehicle}` : null,
    `مدينة التسليم: ${job.city}`,
    amount ? `الإجمالي: ${amount}${job.has_estimated ? " (فيه بنود تقديرية قد تتغير قليلًا، مثل الجمارك أو الشحن)" : ""}` : null,
    job.estimated_delivery_days ? `مدة التوصيل المتوقعة: حوالي ${job.estimated_delivery_days} يوم` : null,
    job.kind === "quote_ready" && formatDateAr(job.valid_until) ? `التسعيرة صالحة حتى: ${formatDateAr(job.valid_until)}` : null,
  ].filter(Boolean).join("\n");

  const goal = job.kind === "quote_ready"
    ? `الهدف: تبلغ العميل أن تسعيرة طلبه جاهزة في حسابه على الموقع، وتذكر له الإجمالي ومدة التوصيل، وتسأله هل ينوي الموافقة عليها.
الموافقة نفسها تتم من حساب العميل في الموقع، وأنت لا تستطيع اعتمادها عنه. إن قال يوافق، ذكّره أن يضغط «موافقة» في صفحة الطلب.
- ينوي الموافقة: confirmed
- لا يريدها أو السعر لا يناسبه: declined (واذكر السبب في الملخص)
- يريد التفكير أو يطلب اتصالًا من موظف: callback`
    : `الهدف: تؤكد مع العميل تفاصيل طلبه الذي وافق عليه (القطعة والكمية والمدينة والإجمالي)، وتتأكد أنه ما زال يريده.
الدفع لا يتم في هذه المكالمة إطلاقًا: فريق المنصة يتواصل معه بطريقة الدفع. لا تطلب ولا تقبل أي بيانات بطاقة أو حساب بنكي.
- التفاصيل صحيحة ويريد الطلب: confirmed
- يريد الإلغاء: declined (واذكر السبب في الملخص)
- تفصيلة خطأ (المدينة أو الكمية مثلًا) أو يطلب موظفًا: callback (واذكر التصحيح في الملخص)`;

  const systemPrompt = `أنت مساعد آلي لمنصة «${platform}» لقطع غيار السيارات، تتصل بالعميل هاتفيًا. تكلم باللهجة السعودية البيضاء، بأدب واختصار، بجمل قصيرة تناسب المكالمة.

${goal}
- لم تفهم الرد، أو المجيب ليس صاحب الطلب: unclear

بيانات الطلب (لا تقل غيرها ولا تخترع أسعارًا أو مواعيد):
${facts}

قواعد:
- أنت مساعد آلي ولست موظفًا، وقلت ذلك في أول جملة. لو سأل العميل، أكد أنك مساعد آلي.
- لا تعد بتخفيض أو تعديل أو موعد غير مذكور أعلاه. أي طلب من هذا النوع: قل إن الفريق بيتواصل معه، والنتيجة callback.
- لو طلب العميل ألا يُتصل به مرة ثانية، احترم ذلك واذكره في الملخص.
- لا تقرأ رقم الطلب إلا لو سأل عنه.
- المكالمة لا تتجاوز دقيقتين.
- قبل إنهاء المكالمة استدعِ الأداة ${OUTCOME_TOOL} مرة واحدة بالنتيجة وملخص من جملة أو جملتين، ثم ودّع العميل وأنهِ المكالمة.`;

  const greeting = `السلام عليكم، معك المساعد الآلي من ${platform}.`;
  const firstMessage = job.kind === "quote_ready"
    ? `${greeting} أتصل بخصوص طلب تسعير ${job.description}. معي ${job.name}؟`
    : `${greeting} أتصل أأكد معك طلب ${job.description}. معي ${job.name}؟`;
  return { firstMessage, systemPrompt };
}

// جسم POST https://api.vapi.ai/call بمساعد مؤقت (transient) لكل مكالمة.
export function vapiCallBody(job: ContactJob, o: { platform: string; phoneNumberId: string; webhookUrl: string; webhookSecret: string;
  model: string; voiceId: string }) {
  const { firstMessage, systemPrompt } = callScript(job, o.platform);
  return {
    phoneNumberId: o.phoneNumberId,
    customer: { number: job.phone, name: job.name.slice(0, 40) },
    assistant: {
      name: `confirm-${job.kind}`,
      firstMessage,
      firstMessageMode: "assistant-speaks-first",
      transcriber: { provider: "azure", language: "ar-SA" },
      voice: { provider: "azure", voiceId: o.voiceId },
      model: {
        provider: "anthropic",
        model: o.model,
        temperature: 0.3,
        messages: [{ role: "system", content: systemPrompt }],
        tools: [
          {
            type: "function",
            function: {
              name: OUTCOME_TOOL,
              description: "يسجّل نتيجة المكالمة. استدعها مرة واحدة قبل إنهاء المكالمة.",
              parameters: {
                type: "object",
                properties: {
                  outcome: { type: "string", enum: [...contactOutcomes], description: "نتيجة المكالمة" },
                  summary: { type: "string", description: "ملخص من جملة أو جملتين بالعربي لما قاله العميل" },
                },
                required: ["outcome", "summary"],
              },
            },
          },
          { type: "endCall" },
        ],
      },
      endCallMessage: "شكرًا لك، مع السلامة.",
      maxDurationSeconds: 180,
      serverMessages: ["tool-calls", "end-of-call-report"],
      // الطلبات التي يحددها جسم الطلب نفسه لا تحمل بيانات اعتماد Vapi المحفوظة، فنرسل السر في الترويسة.
      server: { url: o.webhookUrl, headers: { Authorization: `Bearer ${o.webhookSecret}` } },
      metadata: { jobId: job.id, kind: job.kind },
    },
  };
}

// أسباب انتهاء المكالمة التي تعني أن العميل لم يرد (فتُرسل رسالة واتساب).
const NO_ANSWER = new Set(["customer-did-not-answer", "customer-busy", "voicemail", "call.forwarding.no-answer"]);
// أسباب تعني أن المكالمة لم تبدأ أصلًا من طرفنا أو طرف المزوّد: تُعاد المحاولة لاحقًا.
const isProviderFailure = (reason: string) => reason.includes("failed-to-connect") || reason.includes("error") || reason.startsWith("pipeline-");

export type VapiEvent =
  | { type: "outcome"; callId: string; toolCallId: string; outcome: ContactOutcome; summary: string }
  | { type: "ended"; callId: string; result: "no_answer" | "failed" | "answered"; reason: string; summary: string | null }
  | { type: "ignore" };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseVapiMessage(body: unknown): VapiEvent[] {
  const message = obj(obj(body).message);
  const callId = str(obj(message.call).id);
  if (!callId) return [{ type: "ignore" }];
  if (message.type === "tool-calls") {
    const calls = Array.isArray(message.toolCallList) ? message.toolCallList : [];
    const events: VapiEvent[] = [];
    for (const raw of calls) {
      const call = obj(raw);
      const fn = obj(call.function);
      if (fn.name !== OUTCOME_TOOL) continue;
      let args = fn.arguments;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      const a = obj(args);
      events.push({ type: "outcome", callId, toolCallId: str(call.id), outcome: isOutcome(a.outcome) ? a.outcome : "unclear",
        summary: str(a.summary).slice(0, 2000) });
    }
    return events.length ? events : [{ type: "ignore" }];
  }
  if (message.type === "end-of-call-report") {
    const reason = str(message.endedReason);
    const result = NO_ANSWER.has(reason) ? "no_answer" : isProviderFailure(reason) ? "failed" : "answered";
    const summary = str(obj(message.analysis).summary) || str(message.summary) || null;
    return [{ type: "ended", callId, result, reason, summary: summary ? summary.slice(0, 2000) : null }];
  }
  return [{ type: "ignore" }];
}

// متغيرات قالب واتساب المعتمد: {{1}} الاسم، {{2}} وصف القطعة، {{3}} رقم الطلب. القوالب في README.
export function whatsappVariables(job: ContactJob): Record<string, string> {
  return { "1": job.name.slice(0, 60), "2": job.description.slice(0, 80), "3": job.reference };
}
