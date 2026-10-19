import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Card, PageTitle } from "@/components/ui";
import type { Locale } from "@/i18n/locales";

export default async function NotFound() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("common");
  return (
    <SiteShell locale={locale} path="/">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="flex flex-col gap-3">
          <PageTitle>{t("notFoundTitle")}</PageTitle>
          <Link href="/" className="font-bold text-accent">
            {t("backHome")}
          </Link>
        </Card>
      </div>
    </SiteShell>
  );
}
