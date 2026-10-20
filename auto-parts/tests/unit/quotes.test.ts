import { describe, expect, it } from "vitest";
import { endOfDayRiyadh, isExpired, linesTotal, normalizePhone, normalizeVin, parseQuoteLines } from "@/lib/quotes";

describe("normalizeVin", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeVin(" lvvdb 11b0n-d123456 ")).toBe("LVVDB11B0ND123456");
  });
  it("is null when empty and 'invalid' for bad VINs (I, O, Q or wrong length)", () => {
    expect(normalizeVin("")).toBeNull();
    expect(normalizeVin("LVVDB11B0ND12345")).toBe("invalid");
    expect(normalizeVin("LVVDB11B0ND12345O")).toBe("invalid");
  });
});

describe("normalizePhone", () => {
  it("converts Saudi local numbers and 00 prefixes to E.164", () => {
    expect(normalizePhone("050 123 4567")).toBe("+966501234567");
    expect(normalizePhone("501234567")).toBe("+966501234567");
    expect(normalizePhone("00966501234567")).toBe("+966501234567");
    expect(normalizePhone("+86 138 0013 8000")).toBe("+8613800138000");
  });
  it("accepts Arabic-Indic digits", () => {
    expect(normalizePhone("٠٥٠١٢٣٤٥٦٧")).toBe("+966501234567");
  });
  it("rejects garbage", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
  });
});

describe("parseQuoteLines", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  it("skips rows without an amount and stores discounts as negative", () => {
    const lines = parseQuoteLines(
      form({
        line_code_0: "part", line_amount_0: "110", line_qty_0: "2",
        line_code_1: "customs", line_amount_1: "12.5", line_status_1: "estimated",
        line_code_2: "other",
        line_code_3: "discount", line_amount_3: "10",
      }),
      5,
    );
    expect(lines).toEqual([
      { code: "part", description: null, quantity: 2, unit_amount: 110, status: "confirmed", source: null, beneficiary: null },
      { code: "customs", description: null, quantity: 1, unit_amount: 12.5, status: "estimated", source: null, beneficiary: null },
      { code: "discount", description: null, quantity: 1, unit_amount: -10, status: "confirmed", source: null, beneficiary: null },
    ]);
    expect(linesTotal(lines!)).toBe(222.5);
  });
  it("rejects the whole set when a row is invalid", () => {
    expect(parseQuoteLines(form({ line_code_0: "part", line_amount_0: "abc" }), 1)).toBeNull();
    expect(parseQuoteLines(form({ line_code_0: "bribe", line_amount_0: "5" }), 1)).toBeNull();
    expect(parseQuoteLines(form({ line_code_0: "part", line_amount_0: "5", line_qty_0: "0" }), 1)).toBeNull();
  });
});

describe("dates", () => {
  it("detects expiry and builds end-of-day in Riyadh", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired("2020-01-01T00:00:00Z")).toBe(true);
    expect(endOfDayRiyadh("2026-10-25")).toBe("2026-10-25T23:59:59+03:00");
    expect(endOfDayRiyadh("25/10/2026")).toBeNull();
  });
});
