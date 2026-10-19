"use client";

import { useEffect, useSyncExternalStore } from "react";
import { completeEmailLink } from "@/server/auth-actions";
import { parseEmailLinkHash } from "@/lib/email-link";

// يُقرأ الرابط مرة واحدة عند تحميل الصفحة، قبل أن يُمسح من شريط العنوان.
const initialLink = typeof window === "undefined" ? null : parseEmailLinkHash(window.location.hash);
const noop = () => () => {};

// يلتقط رابط البريد في أي صفحة يصل إليها (الرئيسية أو Site URL)، ويحوّله إلى جلسة في الخادم.
export function EmailLinkHandler({ locale, verifyingLabel }: { locale: string; verifyingLabel: string }) {
  const busy = useSyncExternalStore(noop, () => initialLink !== null, () => false);

  useEffect(() => {
    const link = initialLink;
    if (!link) return;
    // يُمسح الرمز من شريط العنوان فورًا حتى لا يبقى في السجل أو يُنسخ.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const failed = `${locale === "ar" ? "" : `/${locale}`}/login?error=confirmFailed`;
    const run =
      link.kind === "error"
        ? Promise.resolve(failed)
        : completeEmailLink({ accessToken: link.accessToken, refreshToken: link.refreshToken, type: link.type, locale }).catch(() => failed);
    run.then((target) => window.location.replace(target));
  }, [locale]);

  if (!busy) return null;
  return (
    <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 text-lg font-bold">
      {verifyingLabel}
    </div>
  );
}
