import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("notificationEmail", () => {
  it("escapes user text and keeps the direction of the language", async () => {
    const { notificationEmail } = await import("@/lib/email-templates");
    const m = notificationEmail({
      dir: "rtl", lang: "ar", brand: "منصة", title: "تحديث <b>", body: `طلب "x" & <script>`, link: "https://p.example/a?x=1&y=2",
      text: { button: "افتح", linkHint: "انسخ", footer: "تذييل" },
    });
    expect(m.subject).toBe("تحديث <b>");
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain("تحديث &lt;b&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain('href="https://p.example/a?x=1&amp;y=2"');
    expect(m.text).toContain("افتح: https://p.example/a?x=1&y=2");
  });
});

describe("notificationEmailContent", () => {
  it("links finance to the order payment section on the site domain, in their language", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://parts.example/");
    const { notificationEmailContent } = await import("@/lib/push");
    const m = notificationEmailContent("payment_reported", { order_id: "44444444-4444-4444-8444-444444444444", reference: "ORD-1001" }, "en");
    expect(m.subject).toBe("New transfer report");
    expect(m.text).toContain("order ORD-1001");
    expect(m.text).toContain("https://parts.example/en/admin/orders/44444444-4444-4444-8444-444444444444#payment");
  });

  it("falls back to Arabic for an unknown locale", async () => {
    const { notificationEmailContent } = await import("@/lib/push");
    const m = notificationEmailContent("customer_quote_issued", { reference: "RFQ-7" }, "xx");
    expect(m.subject).toBe("وصلتك تسعيرة");
    expect(m.html).toContain('dir="rtl"');
  });
});

describe("POST /api/push/dispatch (email)", () => {
  function setup() {
    vi.stubEnv("PUSH_WEBHOOK_SECRET", "s3cret");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Platform <no-reply@parts.example>");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://parts.example");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const call = async (body: unknown, secret = "s3cret") => {
    const { POST } = await import("@/app/api/push/dispatch/route");
    return POST(new Request("https://parts.example/api/push/dispatch", {
      method: "POST", headers: { "x-push-secret": secret, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
  };

  it("refuses a wrong secret without sending anything", async () => {
    const fetchMock = setup();
    const res = await call({ id: 1, kind: "order_status", tokens: [], email: "c@example.com" }, "nope");
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails a user with no devices, once per notification", async () => {
    const fetchMock = setup();
    const res = await call({ id: 77, kind: "order_status", payload: { reference: "ORD-5", status: "paid" }, locale: "ar", tokens: [], email: "c@example.com" });
    expect(await res.json()).toMatchObject({ sent: 0, email: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("notification-77");
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual(["c@example.com"]);
    expect(sent.subject).toBe("تحديث طلبك ORD-5");
    expect(sent.text).toContain("https://parts.example/account/orders");
  });

  it("ignores a malformed email address", async () => {
    const fetchMock = setup();
    const res = await call({ id: 78, kind: "order_status", tokens: [], email: "not an email" });
    expect(await res.json()).toMatchObject({ email: "none" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
