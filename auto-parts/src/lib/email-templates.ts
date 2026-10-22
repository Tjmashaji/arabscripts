// قوالب البريد: HTML بسيط بأنماط مضمّنة (تعمل في Gmail وOutlook والجوال) + نسخة نصية. كل نص من المستخدم يُهرَّب.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type InvitationEmailText = {
  subject: string; heading: string; intro: string; capabilities: string; message: string; button: string;
  expires: string; sameEmail: string; ignore: string; linkHint: string;
};

export function invitationEmail(o: {
  dir: "rtl" | "ltr"; lang: string; brand: string; link: string; capabilities: string[]; message: string | null; text: InvitationEmailText;
}): { subject: string; html: string; text: string } {
  const t = o.text;
  const align = o.dir === "rtl" ? "right" : "left";
  const p = (s: string, extra = "") => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#1c1917;${extra}">${s}</p>`;
  const html = `<!doctype html><html lang="${o.lang}" dir="${o.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(t.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;font-family:Tahoma,Arial,sans-serif;text-align:${align};" dir="${o.dir}">
<tr><td style="background:#1c1917;color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${escapeHtml(o.brand)}</td></tr>
<tr><td style="padding:24px;">
${p(`<strong style="font-size:20px;">${escapeHtml(t.heading)}</strong>`)}
${p(escapeHtml(t.intro))}
${p(`<strong>${escapeHtml(t.capabilities)}:</strong> ${o.capabilities.map(escapeHtml).join("، ")}`)}
${o.message ? `<div style="margin:0 0 14px;padding:12px 14px;background:#fff7ed;border-radius:8px;font-size:14px;line-height:1.7;color:#7c2d12;"><strong>${escapeHtml(t.message)}:</strong><br>${escapeHtml(o.message).replace(/\n/g, "<br>")}</div>` : ""}
<p style="margin:22px 0;text-align:center;"><a href="${escapeHtml(o.link)}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 28px;border-radius:8px;">${escapeHtml(t.button)}</a></p>
${p(escapeHtml(t.expires), "font-size:13px;color:#57534e;")}
${p(escapeHtml(t.sameEmail), "font-size:13px;color:#57534e;")}
${p(`${escapeHtml(t.linkHint)}<br><span dir="ltr" style="word-break:break-all;font-size:12px;color:#57534e;">${escapeHtml(o.link)}</span>`, "font-size:13px;color:#57534e;")}
${p(escapeHtml(t.ignore), "font-size:12px;color:#a8a29e;margin:18px 0 0;")}
</td></tr></table></td></tr></table></body></html>`;
  const text = [t.heading, "", t.intro, `${t.capabilities}: ${o.capabilities.join(", ")}`, ...(o.message ? ["", `${t.message}: ${o.message}`] : []),
    "", `${t.button}: ${o.link}`, "", t.expires, t.sameEmail, "", t.ignore].join("\n");
  return { subject: t.subject, html, text };
}

export type NotificationEmailText = { button: string; linkHint: string; footer: string };

// بريد الإشعار: نفس عنوان الإشعار الفوري ونصه، وزر يفتح الصفحة المعنية في المنصة.
export function notificationEmail(o: {
  dir: "rtl" | "ltr"; lang: string; brand: string; title: string; body: string; link: string; text: NotificationEmailText;
}): { subject: string; html: string; text: string } {
  const t = o.text;
  const align = o.dir === "rtl" ? "right" : "left";
  const p = (s: string, extra = "") => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#1c1917;${extra}">${s}</p>`;
  const html = `<!doctype html><html lang="${o.lang}" dir="${o.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;font-family:Tahoma,Arial,sans-serif;text-align:${align};" dir="${o.dir}">
<tr><td style="background:#1c1917;color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${escapeHtml(o.brand)}</td></tr>
<tr><td style="padding:24px;">
${p(`<strong style="font-size:20px;">${escapeHtml(o.title)}</strong>`)}
${p(escapeHtml(o.body))}
<p style="margin:22px 0;text-align:center;"><a href="${escapeHtml(o.link)}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 28px;border-radius:8px;">${escapeHtml(t.button)}</a></p>
${p(`${escapeHtml(t.linkHint)}<br><span dir="ltr" style="word-break:break-all;font-size:12px;color:#57534e;">${escapeHtml(o.link)}</span>`, "font-size:13px;color:#57534e;")}
${p(escapeHtml(t.footer), "font-size:12px;color:#a8a29e;margin:18px 0 0;")}
</td></tr></table></td></tr></table></body></html>`;
  const text = [o.title, "", o.body, "", `${t.button}: ${o.link}`, "", t.footer].join("\n");
  return { subject: o.title, html, text };
}
