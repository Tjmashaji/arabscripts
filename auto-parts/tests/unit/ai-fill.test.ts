import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanOptions, cleanValues, describeFields, outputSchema } from "@/lib/ai-fill-profiles";

vi.mock("server-only", () => ({}));

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic { static APIError = APIError; beta = { messages: { parse } }; }
  return { default: Anthropic };
});

const countries = { country_code: [{ value: "CN", label: "الصين" }, { value: "SA", label: "السعودية" }] };

describe("ai fill profiles", () => {
  it("keeps only real select options and drops junk", () => {
    const o = cleanOptions("partner_application", {
      country_code: [{ value: "CN", label: " China\n " }, { value: "CN", label: "dup" }, { value: "x y", label: "bad" }, { value: "", label: "empty" }],
      legal_name: [{ value: "A", label: "not a select" }],
      unknown: [{ value: "Z", label: "z" }],
    });
    expect(o).toEqual({ country_code: [{ value: "CN", label: "China" }] });
  });

  it("asks only for the profile's fields, and selects only when the page has options", () => {
    const keys = Object.keys(outputSchema("partner_application", countries).shape.values.shape);
    expect(keys).toContain("legal_name");
    expect(keys).toContain("country_code");
    expect(keys).not.toContain("operating_country");
    expect(keys).not.toContain("account_kind");
    expect(describeFields("partner_application", countries)).toContain("CN = الصين; SA = السعودية");
  });

  it("cleans the answer: select values must exist, numbers must be numbers", () => {
    const opts = { mode: [{ value: "air", label: "Air" }], priceCurrency: [{ value: "CNY", label: "CNY" }] };
    expect(cleanValues("carrier_service", {
      name: "  Air Guangzhou → Riyadh ", mode: "rocket", priceCurrency: "CNY", pricePerKg: "1,250.5", minCharge: "about 100",
      daysMin: "7", notes: null, iban: "SA00",
    }, opts)).toEqual({ name: "Air Guangzhou → Riyadh", priceCurrency: "CNY", pricePerKg: "1250.5", daysMin: "7" });
  });
});

describe("runAiFill", () => {
  beforeEach(() => parse.mockReset());
  const input = { profile: "partner_application" as const, locale: "ar" as const, text: "Ningbo Co, Ltd. USCC 9133", file: null, options: countries };

  it("sends the material with the fields and returns cleaned values", async () => {
    const { runAiFill } = await import("@/lib/ai-fill");
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { values: { legal_name: "Ningbo Co, Ltd.", country_code: "XX", vat_number: null }, note: " تأكد من العنوان " } });
    const r = await runAiFill(input);
    expect(r).toEqual({ ok: true, values: { legal_name: "Ningbo Co, Ltd." }, note: "تأكد من العنوان" });
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.system).toContain("Never invent");
    expect(JSON.stringify(req.messages)).toContain("<material>\\nNingbo Co, Ltd. USCC 9133\\n</material>");
  });

  it("rejects files that are not PNG, JPG or PDF before calling the model", async () => {
    const { runAiFill } = await import("@/lib/ai-fill");
    const r = await runAiFill({ ...input, text: "", file: new TextEncoder().encode("<svg onload=alert(1)>") });
    expect(r).toEqual({ ok: false, error: "file" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("sends a PDF as a document block", async () => {
    const { runAiFill } = await import("@/lib/ai-fill");
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { values: {}, note: null } });
    await runAiFill({ ...input, text: "", file: new TextEncoder().encode("%PDF-1.7 test") });
    expect(parse.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
  });

  it("reports refusals and API errors without throwing", async () => {
    const { runAiFill } = await import("@/lib/ai-fill");
    parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    expect(await runAiFill(input)).toEqual({ ok: false, error: "refused" });
    parse.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runAiFill(input)).toEqual({ ok: false, error: "failed" });
  });
});
