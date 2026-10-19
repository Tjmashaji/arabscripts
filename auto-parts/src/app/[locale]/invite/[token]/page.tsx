import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/server/partner-actions";
import { countries, type Capability } from "@/lib/partners";
import { localeFrom } from "@/i18n/locales";

type Invite = { status: string; email: string; capabilities: Capability[]; preferred_locale: string; message: string | null; expires_at: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partner" }))("inviteTitle"), robots: { index: false } };
}

// صفحة الدعوة: تُفتح بالرمز قبل الدخول. القبول يتطلب الدخول بالبريد المدعو نفسه.
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("partner");
  const tc = await getTranslations("capabilities");
  const tf = await getTranslations("fields");

  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/.test(token) ? await supabase.rpc("ap_invitation_lookup", { p_token: token }) : { data: null };
  const invite = (Array.isArray(data) ? data[0] : null) as Invite | null;
  const session = await getSession();
  const path = `/invite/${token}`;
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  let body;
  if (!invite) body = <Alert tone="danger">{t("inviteInvalid")}</Alert>;
  else if (invite.status === "expired") body = <Alert tone="danger">{t("inviteExpired")}</Alert>;
  else if (invite.status === "revoked") body = <Alert tone="danger">{t("inviteRevoked")}</Alert>;
  else if (invite.status === "accepted") body = <Alert tone="info">{t("inviteAccepted")}</Alert>;
  else {
    const sameEmail = session && session.email.toLowerCase() === invite.email;
    body = (
      <>
        <p>{t("inviteFor")}</p>
        <div className="flex flex-wrap gap-2">
          {invite.capabilities.map((c) => (
            <Badge key={c} tone="info">
              {tc(c)}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted">
          {t("inviteEmail")}: <span className="ltr-value">{invite.email}</span> · {t("inviteExpires")} {dateFmt.format(new Date(invite.expires_at))}
        </p>
        {invite.message && (
          <blockquote className="rounded-lg bg-surface p-3 text-sm">
            <span className="block font-bold">{t("inviteMessage")}</span>
            {invite.message}
          </blockquote>
        )}
        <p className="text-sm text-muted">{t("noApproval")}</p>
        {!session ? (
          <>
            <Alert tone="info">{t("inviteLoginFirst")}</Alert>
            <div className="flex flex-wrap gap-3">
              <Link href={{ pathname: "/signup", query: { next: path } }} className="rounded-lg bg-accent px-4 py-2 font-bold text-white">
                {(await getTranslations("nav"))("signup")}
              </Link>
              <Link href={{ pathname: "/login", query: { next: path } }} className="rounded-lg border border-line px-4 py-2 font-bold">
                {(await getTranslations("nav"))("login")}
              </Link>
            </div>
          </>
        ) : !sameEmail ? (
          <Alert tone="danger">{t("inviteWrongEmail")}</Alert>
        ) : (
          <form action={acceptInvitation} className="flex flex-col gap-4 border-t border-line pt-4">
            <h2 className="font-bold">{t("acceptTitle")}</h2>
            {error && <Alert tone="danger">{t("actionFailed")}</Alert>}
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token} />
            <Field label={tf("legal_name")} htmlFor="legalName">
              <Input id="legalName" name="legalName" required minLength={2} maxLength={200} />
            </Field>
            <Field label={tf("country_code")} htmlFor="country">
              <Input id="country" name="country" required pattern="[A-Za-z]{2}" maxLength={2} list="countries" dir="ltr" className="uppercase" />
              <datalist id="countries">
                {countries.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <SubmitButton>{t("accept")}</SubmitButton>
          </form>
        )}
      </>
    );
  }

  return (
    <SiteShell locale={locale} path={path}>
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card className="flex flex-col gap-4">
          <PageTitle>{t("inviteTitle")}</PageTitle>
          {body}
        </Card>
      </div>
    </SiteShell>
  );
}
