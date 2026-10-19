import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Alert, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { requestPasswordReset } from "@/server/auth-actions";
import { localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["invalidEmail", "rateLimited"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "auth" }))("forgotTitle") };
}

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { error, sent } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <SiteShell locale={locale} path="/forgot-password">
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="flex flex-col gap-5">
          {sent ? (
            <>
              <PageTitle>{t("forgotSentTitle")}</PageTitle>
              <p className="text-muted">{t("forgotSentBody")}</p>
            </>
          ) : (
            <>
              <PageTitle>{t("forgotTitle")}</PageTitle>
              <p className="text-sm text-muted">{t("forgotHelp")}</p>
              {error && errorKeys.has(error) && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
              <form action={requestPasswordReset} className="flex flex-col gap-4">
                <input type="hidden" name="locale" value={locale} />
                <Field label={t("email")} htmlFor="email">
                  <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required maxLength={254} />
                </Field>
                <Button type="submit">{t("forgotSubmit")}</Button>
              </form>
            </>
          )}
          <Link href="/login" className="text-sm font-bold text-accent">
            {t("backToLogin")}
          </Link>
        </Card>
      </div>
    </SiteShell>
  );
}
