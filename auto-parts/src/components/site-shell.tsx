import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { SiteHeader } from "./site-header";

// غلاف الصفحات العامة وصفحات الحساب. path هو المسار بدون بادئة اللغة (لمبدّل اللغة).
export async function SiteShell({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader locale={locale} path={path} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-card">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">{t("footer")}</p>
      </footer>
    </div>
  );
}
