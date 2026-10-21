import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { deleteAccount, updateLanguage, updateProfile } from "@/server/account-actions";
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
  searchParams: Promise<{ saved?: string; error?: string; confirmed?: string; password?: string; delete?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/account");
  const { saved, error, confirmed, password, delete: deleteStatus } = await searchParams;
  // سبب منع الحذف يُعرض قبل أن يحاول المستخدم (إدارة، مالك منشأة، طلب لم يكتمل).
  const { data: blocker } = await (await createClient()).rpc("ap_account_deletion_blocker");
  const deleteMessage = deleteStatus && ["confirm", "failed", "staff_account", "organization_owner", "open_orders"].includes(deleteStatus) ? deleteStatus : null;
  const t = await getTranslations("account");
  const tRoles = await getTranslations("roles");
  const tAuth = await getTranslations("auth");
  const tq = await getTranslations("quotes");

  return (
    <SiteShell locale={locale} path="/account">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <PageTitle>{t("title")}</PageTitle>
        <nav className="flex flex-wrap gap-2">
          <Link href="/account/requests" className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold">{tq("myRequests")}</Link>
          <Link href="/account/orders" className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold">{tq("myOrders")}</Link>
          <Link href="/request-part" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">{tq("newRequest")}</Link>
        </nav>
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
              <SubmitButton>{t("save")}</SubmitButton>
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
            <SubmitButton variant="secondary">
              {t("save")}
            </SubmitButton>
          </form>
        </Card>

        <Card id="delete" className="flex flex-col gap-3 border-danger/30">
          <h2 className="font-bold text-danger">{t("deleteTitle")}</h2>
          <p className="text-sm">{t("deleteBody")}</p>
          <ul className="list-disc ps-5 text-sm text-muted">
            <li>{t("deleteRemoved")}</li>
            <li>{t("deleteKept")}</li>
          </ul>
          {deleteMessage && <Alert tone="danger">{t(`deleteErrors.${deleteMessage}`)}</Alert>}
          {blocker && blocker !== "forbidden" ? (
            !deleteMessage && <Alert tone="info">{t(`deleteErrors.${blocker}`)}</Alert>
          ) : (
            <form action={deleteAccount} className="flex flex-col gap-3">
              <input type="hidden" name="locale" value={locale} />
              <Field label={t("deleteConfirm")} htmlFor="confirmEmail">
                <Input id="confirmEmail" name="confirmEmail" type="email" dir="ltr" required autoComplete="off" placeholder={session.email} />
              </Field>
              <div><SubmitButton variant="danger">{t("deleteSubmit")}</SubmitButton></div>
            </form>
          )}
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
