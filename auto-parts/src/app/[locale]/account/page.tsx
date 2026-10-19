import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { Alert, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { updateLanguage, updateProfile } from "@/server/account-actions";
import { localeNames, locales, localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "account" }))("title") };
}

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; confirmed?: string; password?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/account");
  const { saved, error, confirmed, password } = await searchParams;
  const t = await getTranslations("account");
  const tRoles = await getTranslations("roles");
  const tAuth = await getTranslations("auth");

  return (
    <SiteShell locale={locale} path="/account">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <PageTitle>{t("title")}</PageTitle>
        {confirmed && <Alert tone="success">{tAuth("confirmedTitle")}</Alert>}
        {saved && <Alert tone="success">{t("saved")}</Alert>}
        {password && <Alert tone="success">{tAuth("passwordUpdated")}</Alert>}
        {error && <Alert tone="danger">{t("saveFailed")}</Alert>}
        {session.status === "suspended" && <Alert tone="danger">{t("suspended")}</Alert>}

        <Card>
          <form action={updateProfile} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <Field label={t("email")} htmlFor="email">
              <Input id="email" value={session.email} readOnly dir="ltr" className="bg-surface" />
            </Field>
            <Field label={t("fullName")} htmlFor="fullName">
              <Input id="fullName" name="fullName" defaultValue={session.fullName} required maxLength={120} autoComplete="name" />
            </Field>
            <Field label={t("phone")} hint={t("phoneHint")} htmlFor="phone">
              <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={session.phone ?? ""} pattern="\+?[0-9 ]{6,20}" autoComplete="tel" />
            </Field>
            <div>
              <Button type="submit">{t("save")}</Button>
            </div>
          </form>
        </Card>

        <Card>
          <form action={updateLanguage} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <input type="hidden" name="locale" value={locale} />
            <div className="flex-1">
              <Field label={t("language")} htmlFor="preferredLocale">
                <Select id="preferredLocale" name="preferredLocale" defaultValue={session.locale}>
                  {locales.map((l) => (
                    <option key={l} value={l} lang={l}>
                      {localeNames[l]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              {t("save")}
            </Button>
          </form>
        </Card>

        {session.staffRoles.length > 0 && (
          <Card>
            <h2 className="font-bold">{t("staffRoles")}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {session.staffRoles.map((r) => (
                <li key={r} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent-strong">
                  {tRoles(r)}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </SiteShell>
  );
}
