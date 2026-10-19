import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { Alert, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { updatePassword } from "@/server/auth-actions";
import { localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["mismatch", "weakPassword", "samePassword", "rateLimited", "generic"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "auth" }))("resetTitle") };
}

// يصلها المستخدم من رابط الاستعادة في البريد (الرابط يفتح جلسة مؤقتة عبر /auth/confirm).
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/reset-password");
  const { error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <SiteShell locale={locale} path="/reset-password">
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="flex flex-col gap-5">
          <PageTitle>{t("resetTitle")}</PageTitle>
          <p className="ltr-value text-sm text-muted">{session.email}</p>
          {error && errorKeys.has(error) && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
          <form action={updatePassword} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <Field label={t("newPassword")} hint={t("passwordHint")} htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required minLength={8} maxLength={72} />
            </Field>
            <Field label={t("confirmPassword")} htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" dir="ltr" required minLength={8} maxLength={72} />
            </Field>
            <Button type="submit">{t("resetSubmit")}</Button>
          </form>
        </Card>
      </div>
    </SiteShell>
  );
}
