import { describe, expect, it } from "vitest";
import { callScript, formatAmount, OUTCOME_TOOL, parseJobs, parseVapiMessage, vapiCallBody, whatsappVariables, type ContactJob } from "@/lib/contact";

const job = (over: Partial<ContactJob> = {}): ContactJob => ({
  id: "11111111-1111-4111-8111-111111111111", kind: "order_confirm", attempt: 1, phone: "+966500000010", name: "أبو خالد",
  reference: "ORD-100123", description: "فلتر زيت", part_number: "F-1", quantity: 2, city: "الرياض", vehicle: "شيري أريزو 6 2023",
  total: 1250.5, currency: "SAR", valid_until: "2026-10-30T12:00:00Z", estimated_delivery_days: 10, has_estimated: true, ...over,
});

describe("callScript", () => {
  it("discloses the assistant is automated in the first sentence", () => {
    const { firstMessage } = callScript(job(), "قطعتي");
    expect(firstMessage).toMatch(/^السلام عليكم، معك المساعد الآلي من قطعتي\./);
    expect(firstMessage).toContain("أبو خالد");
  });
  it("gives the model only the order facts, and forbids payment details on order calls", () => {
    const { systemPrompt } = callScript(job(), "قطعتي");
    expect(systemPrompt).toContain("رقم الطلب: ORD-100123");
    expect(systemPrompt).toContain("1,250.5 ريال");
    expect(systemPrompt).toContain("بنود تقديرية");
    expect(systemPrompt).toContain("لا تطلب ولا تقبل أي بيانات بطاقة");
    expect(systemPrompt).toContain(OUTCOME_TOOL);
    expect(systemPrompt).not.toContain("+966500000010");
  });
  it("tells the quote-ready caller that acceptance happens on the website", () => {
    const { systemPrompt } = callScript(job({ kind: "quote_ready", reference: "RQ-100001" }), "قطعتي");
    expect(systemPrompt).toContain("رقم طلب التسعير: RQ-100001");
    expect(systemPrompt).toContain("لا تستطيع اعتمادها عنه");
    expect(systemPrompt).toContain("التسعيرة صالحة حتى");
  });
  it("leaves out facts that are missing", () => {
    const { systemPrompt } = callScript(job({ vehicle: null, total: null, estimated_delivery_days: null }), "قطعتي");
    expect(systemPrompt).not.toContain("السيارة:");
    expect(systemPrompt).not.toContain("الإجمالي:");
    expect(systemPrompt).not.toContain("مدة التوصيل");
  });
});

describe("formatAmount", () => {
  it("reads SAR as riyal and keeps other currencies", () => {
    expect(formatAmount(100, "SAR")).toBe("100 ريال");
    expect(formatAmount(99.9, "USD")).toBe("99.9 USD");
    expect(formatAmount(null, "SAR")).toBeNull();
  });
});

describe("vapiCallBody", () => {
  const body = vapiCallBody(job(), { platform: "قطعتي", phoneNumberId: "pn_1", webhookUrl: "https://x.example/api/contact/webhook",
    webhookSecret: "s3cret", model: "claude-haiku-5-5", voiceId: "ar-SA-HamedNeural" });
  it("calls the customer with Claude, Arabic speech and the outcome tool", () => {
    expect(body.customer.number).toBe("+966500000010");
    expect(body.assistant.model.provider).toBe("anthropic");
    expect(body.assistant.model.model).toBe("claude-haiku-5-5");
    expect(body.assistant.transcriber.language).toBe("ar-SA");
    expect(body.assistant.model.tools.map((t) => t.type)).toEqual(["function", "endCall"]);
  });
  it("sends the webhook secret as a header and the job id as metadata", () => {
    expect(body.assistant.server).toEqual({ url: "https://x.example/api/contact/webhook", headers: { Authorization: "Bearer s3cret" } });
    expect(body.assistant.metadata.jobId).toBe(job().id);
  });
});

describe("parseVapiMessage", () => {
  const call = { id: "call-1" };
  it("reads the outcome tool call, with arguments as object or JSON string", () => {
    expect(parseVapiMessage({ message: { type: "tool-calls", call, toolCallList: [
      { id: "tc1", function: { name: OUTCOME_TOOL, arguments: { outcome: "confirmed", summary: "أكد" } } },
      { id: "tc2", function: { name: OUTCOME_TOOL, arguments: '{"outcome":"declined","summary":"غالي"}' } },
    ] } })).toEqual([
      { type: "outcome", callId: "call-1", toolCallId: "tc1", outcome: "confirmed", summary: "أكد" },
      { type: "outcome", callId: "call-1", toolCallId: "tc2", outcome: "declined", summary: "غالي" },
    ]);
  });
  it("turns an unknown outcome into unclear and ignores other tools", () => {
    const evs = parseVapiMessage({ message: { type: "tool-calls", call, toolCallList: [
      { id: "a", function: { name: "other", arguments: {} } },
      { id: "b", function: { name: OUTCOME_TOOL, arguments: { outcome: "maybe" } } },
    ] } });
    expect(evs).toEqual([{ type: "outcome", callId: "call-1", toolCallId: "b", outcome: "unclear", summary: "" }]);
  });
  it("maps ended reasons to no answer, provider failure or answered", () => {
    const ended = (endedReason: string) => parseVapiMessage({ message: { type: "end-of-call-report", call, endedReason } })[0];
    expect(ended("customer-did-not-answer")).toMatchObject({ type: "ended", result: "no_answer" });
    expect(ended("customer-busy")).toMatchObject({ result: "no_answer" });
    expect(ended("voicemail")).toMatchObject({ result: "no_answer" });
    expect(ended("twilio-failed-to-connect-call")).toMatchObject({ result: "failed" });
    expect(ended("customer-ended-call")).toMatchObject({ result: "answered" });
    expect(ended("assistant-ended-call")).toMatchObject({ result: "answered" });
  });
  it("ignores other messages and bodies without a call id", () => {
    expect(parseVapiMessage({ message: { type: "status-update", call } })).toEqual([{ type: "ignore" }]);
    expect(parseVapiMessage({ message: { type: "tool-calls" } })).toEqual([{ type: "ignore" }]);
    expect(parseVapiMessage(null)).toEqual([{ type: "ignore" }]);
  });
});

describe("parseJobs and whatsappVariables", () => {
  it("drops malformed rows", () => {
    expect(parseJobs([job(), { id: 1 }, null, { ...job(), kind: "spam" }])).toHaveLength(1);
    expect(parseJobs("nope")).toEqual([]);
  });
  it("fills the approved template's three variables", () => {
    expect(whatsappVariables(job())).toEqual({ "1": "أبو خالد", "2": "فلتر زيت", "3": "ORD-100123" });
  });
});
