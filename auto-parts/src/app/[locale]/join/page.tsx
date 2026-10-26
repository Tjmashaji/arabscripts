import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { accountKinds, selfCapabilities } from "@/lib/partners";
import { CountrySelect } from "@/components/country-select";
import { alternates } from "@/lib/seo";
import { registerAsPartner } from "@/server/partner-actions";
import { localeFrom } from "@/i18n/locales";

const errorKeys = new Set(["invalid", "already", "confirm", "failed"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "join" });
  return { title: t("title"), description: t("intro"), alternates: alternates(locale, "/join") };
}

// رابط عام يُرسل للموردين والمصانع والناقلين: إنشاء حساب ثم تسجيل المنشأة، ثم طلب الاعتماد كالمعتاد.
export default async function JoinPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations("join");
  const tc = await getTranslations("capabilities");
  const tf = await getTranslations("fields");
  const tn = await getTranslations("nav");
  const session = await getSession();
  const steps = t.raw("steps") as string[];

  return (
    <SiteShell locale={locale} path="/join">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted">{t("intro")}</p>
        </div>

        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{t("howTitle")}</h2>
          <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-sm text-muted">{t("free")}</p>
        </Card>

        <Card className="flex flex-col gap-4">
          {error && errorKeys.has(error) && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
          {!session ? (
            <>
              <p>{t("accountFirst")}</p>
              <div className="flex flex-wrap gap-3">
                <Link href={{ pathname: "/signup", query: { next: "/join" } }} className="rounded-lg bg-accent px-4 py-2 font-bold text-white">
                  {tn("signup")}
                </Link>
                <Link href={{ pathname: "/login", query: { next: "/join" } }} className="rounded-lg border border-line px-4 py-2 font-bold">
                  {tn("login")}
                </Link>
              </div>
            </>
          ) : session.organizations.length > 0 ? (
            <>
              <Alert tone="info">{t("alreadyPartner")}</Alert>
              <Link href="/partner/application" className="self-start rounded-lg bg-accent px-4 py-2 font-bold text-white">
                {t("openApplication")}
              </Link>
            </>
          ) : (
            <form action={registerAsPartner} className="flex flex-col gap-4">
              <input type="hidden" name="locale" value={locale} />
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-1 text-sm font-bold">{t("kindTitle")}</legend>
                {accountKinds.map((k) => (
                  <label key={k} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="radio" name="accountKind" value={k} required defaultChecked={k === "company"} className="mt-1 accent-accent" />
                    <span><span className="block font-bold">{t(`kinds.${k}`)}</span><span className="text-muted">{t(`kindHints.${k}`)}</span></span>
                  </label>
                ))}
              </fieldset>
              <Field label={t("nameLabel")} hint={t("nameHint")} htmlFor="legalName">
                <Input id="legalName" name="legalName" required minLength={2} maxLength={200} />
              </Field>
              <Field label={tf("country_code")} htmlFor="country">
                <CountrySelect name="country" locale={locale} required placeholder={t("countryPlaceholder")} />
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-bold">{t("capabilities")}</legend>
                {selfCapabilities.map((c) => (
                  <label key={c} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="checkbox" name="capabilities" value={c} className="mt-1 size-4 accent-accent" />
                    <span>
                      <span className="block font-bold">{tc(c)}</span>
                      <span className="text-muted">{t(`capabilityHints.${c}`)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="text-xs text-muted">{t("review")}</p>
              <SubmitButton>{t("submit")}</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
