import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { pushText, type PushMessages } from "@/lib/push-content";

const id = "3f1c2b4a-1111-4222-8333-944455556666";

describe("pushText", () => {
  it("builds the text in the user's language and links to the right page", () => {
    const m = pushText(en as unknown as PushMessages, "customer_quote_issued", { request_id: id, reference: "RFQ-100" }, "en");
    expect(m.title).toBe("Your quote is ready");
    expect(m.body).toContain("RFQ-100");
    expect(m.path).toBe(`/en/account/requests/${id}`);
  });
  it("translates the order status and uses no prefix for Arabic", () => {
    const m = pushText(ar as unknown as PushMessages, "order_status", { reference: "ORD-7", status: "out_for_delivery" }, "ar");
    expect(m.title).toContain("ORD-7");
    expect(m.body).toContain("خرج للتوصيل");
    expect(m.path).toBe("/account/orders");
  });
  it("never puts an untrusted id in the link, and falls back for unknown kinds", () => {
    expect(pushText(zh as unknown as PushMessages, "shipment_assigned", { shipment_id: "../../evil" }, "zh").path).toBe("/zh/carrier");
    const m = pushText(ar as unknown as PushMessages, "something_new", {}, "ar");
    expect(m.body).toBe("لديك إشعار جديد.");
    expect(m.path).toBe("/account");
  });
  it("sends a new partner application to its admin review page", () => {
    const m = pushText(ar as unknown as PushMessages, "partner_application_submitted", { application_id: id, reference: "Henghui Auto Parts" }, "ar");
    expect(m.body).toContain("Henghui Auto Parts");
    expect(m.path).toBe(`/admin/partner-applications/${id}`);
  });
  it("has every push text in all three languages", () => {
    const keys = (x: unknown) => Object.keys((x as PushMessages).push).sort();
    expect(keys(en)).toEqual(keys(ar));
    expect(keys(zh)).toEqual(keys(ar));
  });
});
