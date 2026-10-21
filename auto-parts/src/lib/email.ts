import "server-only";

// إرسال البريد عبر Resend (https://resend.com). يعمل فقط إذا ضُبط المتغيران في Vercel:
//   RESEND_API_KEY  مفتاح سري (لا يُكتب في الكود ولا يصل للمتصفح)
//   EMAIL_FROM      المرسل، مثل: «منصة قطع الغيار <no-reply@example.sa>» من نطاق موثّق في Resend
// بدونهما لا يُرسل شيء، وتبقى الواجهة تعرض الرابط للنسخ.
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type Email = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };

export async function sendEmail(mail: Email): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!emailConfigured()) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !body.id) return { ok: false, error: `${res.status} ${body.name ?? ""} ${body.message ?? ""}`.trim() };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : "network" };
  }
}
