import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Card, PageTitle } from "@/components/ui";
import { localeFrom } from "@/i18n/locales";

export default async function ForbiddenPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const t = await getTranslations("common");
  return (
    <SiteShell locale={locale} path="/forbidden">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="flex flex-col gap-3">
          <PageTitle>{t("forbiddenTitle")}</PageTitle>
          <p className="text-muted">{t("forbiddenBody")}</p>
          <Link href="/" className="font-bold text-accent">
            {t("backHome")}
          </Link>
        </Card>
      </div>
    </SiteShell>
  );
}
