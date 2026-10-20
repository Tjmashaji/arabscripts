import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { directionOf, type Locale } from "@/i18n/locales";
import { env } from "@/lib/env";
import { ogLocale } from "@/lib/seo";
import { plex } from "../fonts";
import { EmailLinkHandler } from "@/components/email-link-handler";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const name = env.platformName ?? t("title");
  return {
    metadataBase: new URL(env.siteUrl),
    title: { default: name, template: `%s · ${name}` },
    description: t("description"),
    applicationName: name,
    openGraph: { type: "website", siteName: name, title: name, description: t("description"), locale: ogLocale[locale as Locale] ?? "ar_SA" },
    twitter: { card: "summary", title: name, description: t("description") },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const verifying = (await getTranslations({ locale, namespace: "auth" }))("verifying");

  return (
    <html lang={locale} dir={directionOf(locale)} className={plex.variable}>
      <body className="antialiased">
        <NextIntlClientProvider>
          <EmailLinkHandler locale={locale} verifyingLabel={verifying} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
