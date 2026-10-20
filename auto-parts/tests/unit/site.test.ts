import { describe, expect, it } from "vitest";
import { parseSetting, whatsappLink } from "@/lib/site";

describe("parseSetting", () => {
  it("validates numeric settings within their range", () => {
    expect(parseSetting("service_fee_percent", "7.5")).toBe(7.5);
    expect(parseSetting("service_fee_percent", "60")).toBeNull();
    expect(parseSetting("availability_max_age_hours", "48")).toBe(48);
    expect(parseSetting("availability_max_age_hours", "1.5")).toBeNull();
    expect(parseSetting("availability_max_age_hours", "")).toBeNull();
  });
  it("keeps text settings as text, allows clearing, and rejects bad formats", () => {
    expect(parseSetting("commercial_register", "1010123456")).toBe("1010123456");
    expect(parseSetting("commercial_register", "123")).toBeNull();
    expect(parseSetting("contact_whatsapp", "+966501234567")).toBe("+966501234567");
    expect(parseSetting("contact_whatsapp", "0501234567")).toBeNull();
    expect(parseSetting("contact_email", "hello@example.sa")).toBe("hello@example.sa");
    expect(parseSetting("contact_email", "not-an-email")).toBeNull();
    expect(parseSetting("contact_email", "")).toBe("");
  });
  it("rejects unknown keys", () => {
    expect(parseSetting("default_locale", "en")).toBeNull();
  });
  it("builds WhatsApp links from E.164 numbers", () => {
    expect(whatsappLink("+966501234567")).toBe("https://wa.me/966501234567");
  });
});
