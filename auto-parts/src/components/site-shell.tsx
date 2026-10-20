import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// غلاف الصفحات العامة وصفحات الحساب. path هو المسار بدون بادئة اللغة (لمبدّل اللغة).
export async function SiteShell({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader locale={locale} path={path} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
