import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Alert, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { getSession, localePath } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { signUp } from "@/server/auth-actions";
import { localeNames, locales, localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["weakPassword", "invalidEmail", "nameRequired", "rateLimited", "generic"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "auth" }))("signupTitle") };
}

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string; sent?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { error, next: rawNext, sent } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getSession()) redirect(localePath(locale, next));
  const t = await getTranslations("auth");

  return (
    <SiteShell locale={locale} path="/signup">
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="flex flex-col gap-5">
          {sent ? (
            <>
              <PageTitle>{t("checkEmailTitle")}</PageTitle>
              <p className="text-muted">{t("checkEmailBody")}</p>
            </>
          ) : (
            <>
              <PageTitle>{t("signupTitle")}</PageTitle>
              {error && errorKeys.has(error) && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
              <form action={signUp} className="flex flex-col gap-4">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="next" value={next} />
                <Field label={t("fullName")} htmlFor="fullName">
                  <Input id="fullName" name="fullName" autoComplete="name" required maxLength={120} />
                </Field>
                <Field label={t("email")} htmlFor="email">
                  <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required maxLength={254} />
                </Field>
                <Field label={t("password")} hint={t("passwordHint")} htmlFor="password">
                  <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required minLength={8} maxLength={72} />
                </Field>
                <Field label={t("preferredLanguage")} htmlFor="preferredLocale">
                  <Select id="preferredLocale" name="preferredLocale" defaultValue={locale}>
                    {locales.map((l) => (
                      <option key={l} value={l} lang={l}>
                        {localeNames[l]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit">{t("submitSignup")}</Button>
              </form>
              <p className="text-sm text-muted">
                {t("haveAccount")}{" "}
                <Link href={{ pathname: "/login", query: { next } }} className="font-bold text-accent">
                  {(await getTranslations("nav"))("login")}
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
