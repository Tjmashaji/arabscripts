"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button, Card } from "@/components/ui";

// خطأ غير متوقع داخل صفحة: رسالة واضحة، إعادة المحاولة، ورقم مرجعي يذكره المستخدم للدعم (بلا تفاصيل تقنية).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-md items-center px-4 py-16">
      <Card className="flex w-full flex-col gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        {error.digest && <p className="text-xs text-muted">{t("reference")}: <span className="ltr-value">{error.digest}</span></p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>{t("retry")}</Button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-bold">{t("home")}</Link>
        </div>
      </Card>
    </main>
  );
}
