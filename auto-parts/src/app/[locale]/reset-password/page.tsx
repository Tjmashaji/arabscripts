import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { hasFreshRecovery } from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "@/server/auth-actions";
import { localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["mismatch", "weakPassword", "samePassword", "rateLimited", "generic", "currentInvalid"]);

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
  // خارج رابط الاستعادة الحديث تُطلب كلمة المرور الحالية (نفس شرط الخادم في updatePassword).
  const { data: claims } = await (await createClient()).auth.getClaims();
  const needsCurrent = !hasFreshRecovery(claims?.claims.amr);
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
            {needsCurrent && (
              <Field label={t("currentPassword")} htmlFor="current">
                <Input id="current" name="current" type="password" autoComplete="current-password" dir="ltr" required maxLength={72} />
              </Field>
            )}
            <Field label={t("newPassword")} hint={t("passwordHint")} htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required minLength={8} maxLength={72} />
            </Field>
            <Field label={t("confirmPassword")} htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" dir="ltr" required minLength={8} maxLength={72} />
            </Field>
            <SubmitButton>{t("resetSubmit")}</SubmitButton>
          </form>
        </Card>
      </div>
    </SiteShell>
  );
}
