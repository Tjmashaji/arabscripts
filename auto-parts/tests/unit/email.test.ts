import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, invitationEmail } from "@/lib/email-templates";

vi.mock("server-only", () => ({}));

const text = { subject: "دعوة", heading: "مرحبًا", intro: "دعوة للانضمام", capabilities: "الصفات", message: "رسالة", button: "قبول الدعوة",
  expires: "تنتهي قريبًا", sameEmail: "سجّل بنفس البريد", ignore: "تجاهلها", linkHint: "أو انسخ الرابط" };

describe("invitationEmail", () => {
  it("escapes the admin message and keeps the link and capabilities", () => {
    const m = invitationEmail({ dir: "rtl", lang: "ar", brand: "منصة <X>", link: "https://x.test/invite/abc", capabilities: ["مورد", "ناقل"],
      message: '<script>alert(1)</script>\nسطر "2"', text });
    expect(m.html).not.toContain("<script>alert");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>سطر &quot;2&quot;");
    expect(m.html).toContain('href="https://x.test/invite/abc"');
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain("مورد، ناقل");
    expect(m.text).toContain("قبول الدعوة: https://x.test/invite/abc");
    expect(m.subject).toBe("دعوة");
  });
  it("omits the message box when there is no message", () => {
    expect(invitationEmail({ dir: "ltr", lang: "en", brand: "B", link: "https://x", capabilities: [], message: null, text }).html).not.toContain("رسالة:");
  });
  it("escapes all HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("sendEmail", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("does nothing until the key and sender are configured", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const { sendEmail } = await import("@/lib/email");
    expect(await sendEmail({ to: "a@b.c", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, error: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("posts to Resend with the key and reports the result", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("EMAIL_FROM", "P <no-reply@x.test>");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { sendEmail } = await import("@/lib/email");
    expect(await sendEmail({ to: "a@b.c", subject: "s", html: "h", text: "t", idempotencyKey: "k1" })).toEqual({ ok: true, id: "msg_1" });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "P <no-reply@x.test>", to: ["a@b.c"] });
  });
  it("reports provider errors without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("EMAIL_FROM", "P <no-reply@x.test>");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "domain not verified" }), { status: 403 })));
    const { sendEmail } = await import("@/lib/email");
    expect(await sendEmail({ to: "a@b.c", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, error: "403 validation_error domain not verified" });
  });
});
