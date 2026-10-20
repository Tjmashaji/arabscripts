import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { TrackForm } from "@/components/track-form";
import { PageTitle } from "@/components/ui";
import { alternates } from "@/lib/seo";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "track" });
  return { title: t("title"), description: t("description"), alternates: alternates(locale, "/track") };
}

export default async function TrackPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const t = await getTranslations("track");
  return (
    <SiteShell locale={locale} path="/track">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted">{t("description")}</p>
        <TrackForm />
      </div>
    </SiteShell>
  );
}
