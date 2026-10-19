import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Alert, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { getSession, localePath } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { signIn } from "@/server/auth-actions";
import { localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["invalid", "notConfirmed", "rateLimited", "confirmFailed", "generic"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "auth" }))("loginTitle") };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { error, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getSession()) redirect(localePath(locale, next));
  const t = await getTranslations("auth");

  return (
    <SiteShell locale={locale} path="/login">
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="flex flex-col gap-5">
          <PageTitle>{t("loginTitle")}</PageTitle>
          {error && errorKeys.has(error) && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
          <form action={signIn} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={next} />
            <Field label={t("email")} htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required maxLength={254} />
            </Field>
            <Field label={t("password")} htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required minLength={8} maxLength={72} />
            </Field>
            <Button type="submit">{t("submitLogin")}</Button>
          </form>
          <p className="text-sm text-muted">
            {t("noAccount")}{" "}
            <Link href={{ pathname: "/signup", query: { next } }} className="font-bold text-accent">
              {(await getTranslations("nav"))("signup")}
            </Link>
          </p>
        </Card>
      </div>
    </SiteShell>
  );
}
