"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { completeEmailLink } from "@/server/auth-actions";
import { parseEmailLinkHash, type EmailLinkHash } from "@/lib/email-link";
import { tokenEmail } from "@/lib/auth-callback";
import { Button } from "@/components/ui";

// يُقرأ الرابط مرة واحدة عند تحميل الصفحة، قبل أن يُمسح من شريط العنوان.
const initialLink = typeof window === "undefined" ? null : parseEmailLinkHash(window.location.hash);

type Session = Extract<EmailLinkHash, { kind: "session" }>;

// يلتقط رابط البريد في أي صفحة يصل إليها (الرئيسية أو Site URL)، ويحوّله إلى جلسة في الخادم.
// قبل فتح الجلسة يعرض البريد الذي في الرابط ويطلب التأكيد: رابط يرسله شخص آخر (فيه جلسته هو)
// لا يُدخل الزائر في حساب غيره دون أن ينتبه.
export function EmailLinkHandler({ locale, verifyingLabel }: { locale: string; verifyingLabel: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const link = initialLink;
    if (!link) return;
    // يُمسح الرمز من شريط العنوان فورًا حتى لا يبقى في السجل أو يُنسخ.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (link.kind === "error") {
      window.location.replace(`${locale === "ar" ? "" : `/${locale}`}/login?error=confirmFailed`);
      return;
    }
    // الحالة تُضبط مرة واحدة من رابط الصفحة بعد التحميل (لا يتوفر في الخادم).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(link);
  }, [locale]);

  function proceed() {
    if (!pending) return;
    setBusy(true);
    const failed = `${locale === "ar" ? "" : `/${locale}`}/login?error=confirmFailed`;
    completeEmailLink({ accessToken: pending.accessToken, refreshToken: pending.refreshToken, type: pending.type, locale })
      .catch(() => failed)
      .then((target) => window.location.replace(target));
  }

  if (busy) {
    return (
      <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 text-lg font-bold">
        {verifyingLabel}
      </div>
    );
  }
  if (!pending) return null;
  const email = tokenEmail(pending.accessToken);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="email-link-title" className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-card p-5">
        <h2 id="email-link-title" className="font-bold">{t("linkConfirmTitle")}</h2>
        {email && <p className="ltr-value break-all text-sm font-bold">{email}</p>}
        <p className="text-sm text-muted">{t("linkConfirmBody")}</p>
        <div className="flex gap-2">
          <Button type="button" onClick={proceed} autoFocus>{t("linkContinue")}</Button>
          <Button type="button" variant="secondary" onClick={() => setPending(null)}>{t("linkCancel")}</Button>
        </div>
      </div>
    </div>
  );
}
