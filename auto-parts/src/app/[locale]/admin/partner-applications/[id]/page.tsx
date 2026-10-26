import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle, Textarea, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reviewApplication, startReview } from "@/server/admin-actions";
import { applicationFields, reviewableStatuses, type ApplicationStatus } from "@/lib/partners";
import { localeFrom, localeNames, isLocale } from "@/i18n/locales";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/catalog";
import type { CarrierService } from "@/components/carrier-service-form";

const decisionLabels: Record<string, "approve" | "reject" | "requestChanges" | "startReview"> = {
  approved: "approve", rejected: "reject", changes_requested: "requestChanges", under_review: "startReview",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminPartners" }))("applications") };
}

type App = {
  id: string; status: string; contact_name: string | null; contact_title: string | null; contact_phone: string | null;
  contact_email: string | null; languages: string[]; declaration_accepted_at: string | null; submitted_at: string | null; decision_reason: string | null;
  organization: {
    id: string; account_kind: "company" | "individual"; registration_number: string | null; vat_number: string | null; city: string | null;
    legal_name: string; trade_name: string | null; entity_type: string | null; country_code: string; registered_address: string | null;
    operating_country: string | null; website: string | null; activity_description: string | null; billing_currency: string | null; preferred_locale: string;
    ap_organization_verifications: { capability: string; status: string; decision_reason: string | null }[];
  };
};
type Doc = { id: string; document_type: string; file_name: string; size_bytes: number; issuing_country: string | null; document_expiry_date: string | null; created_at: string };
type Review = { id: number; decision: string; reason: string | null; approved_capabilities: string[]; rejected_capabilities: string[]; override_reason: string | null; reviewer_id: string | null; created_at: string };

export default async function ApplicationReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string; decided?: string; started?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/partner-applications", "accounts.approve");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("adminPartners");
  const tf = await getTranslations("fields");
  const tc = await getTranslations("capabilities");
  const tcs = await getTranslations("capStatus");
  const tas = await getTranslations("appStatus");
  const td = await getTranslations("docTypes");
  const supabase = await createClient();

  const { data } = await supabase
    .from("ap_partner_applications")
    .select(`id, status, contact_name, contact_title, contact_phone, contact_email, languages, declaration_accepted_at, submitted_at, decision_reason,
      organization:ap_organizations(id, account_kind, registration_number, vat_number, city, legal_name, trade_name, entity_type, country_code, registered_address, operating_country, website,
        activity_description, billing_currency, preferred_locale, ap_organization_verifications(capability, status, decision_reason))`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const app = data as unknown as App;
  const org = app.organization;

  const [{ data: docs }, { data: reviews }, { data: missingDb }, { data: bank }, { data: services }] = await Promise.all([
    supabase.from("ap_verification_documents").select("id, document_type, file_name, size_bytes, issuing_country, document_expiry_date, created_at")
      .eq("application_id", id).order("created_at"),
    supabase.from("ap_application_reviews").select("id, decision, reason, approved_capabilities, rejected_capabilities, override_reason, reviewer_id, created_at")
      .eq("application_id", id).order("created_at", { ascending: false }),
    supabase.rpc("ap_application_missing", { p_app: id }),
    supabase.from("ap_organization_bank_accounts").select("bank_name, account_holder, iban, account_number, swift, currency, updated_at")
      .eq("organization_id", org.id).maybeSingle(),
    supabase.from("ap_carrier_services").select("*").eq("organization_id", org.id).order("created_at"),
  ]);
  const individual = org.account_kind === "individual";
  const tp = await getTranslations("partner");
  const tm = await getTranslations("shippingModes");
  const tcar = await getTranslations("carrier");
  const reviewerIds = [...new Set(((reviews ?? []) as Review[]).map((r) => r.reviewer_id).filter((x): x is string => !!x))];
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("ap_profiles").select("user_id, full_name").in("user_id", reviewerIds)
    : { data: [] };
  const names = new Map((reviewers ?? []).map((r) => [r.user_id as string, r.full_name as string]));

  const requested = org.ap_organization_verifications.filter((v) => v.status === "requested");
  // نفس قاعدة الإرسال في قاعدة البيانات (حسب نوع الحساب والصفات).
  const missing = (missingDb ?? []) as string[];
  const reviewable = reviewableStatuses.includes(app.status as ApplicationStatus);
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const row = (label: string, value: string | null | undefined, ltr = false) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={ltr ? "ltr-value" : undefined}>{value || "—"}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/partner-applications" className="text-sm font-bold text-accent">
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>{org.legal_name}</PageTitle>
        <Badge tone={statusTone(app.status)}>{tas(app.status)}</Badge>
      </div>
      {q.decided && <Alert tone="success">{t("decided")}</Alert>}
      {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-5">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              {row(tp("kindTitle"), tp(`kinds.${org.account_kind}`))}
              {row(individual ? tf("full_name") : tf("legal_name"), org.legal_name)}
              {!individual && row(tf("registration_number"), org.registration_number, true)}
              {!individual && row(tf("vat_number"), org.vat_number, true)}
              {row(tf("city"), org.city)}
              {row(tf("trade_name"), org.trade_name)}
              {row(tf("entity_type"), org.entity_type)}
              {row(tf("country_code"), org.country_code, true)}
              {row(tf("operating_country"), org.operating_country, true)}
              {row(tf("billing_currency"), org.billing_currency, true)}
              {row(tf("website"), org.website, true)}
              {row(tf("languages"), app.languages.map((l) => (isLocale(l) ? localeNames[l] : l)).join("، "))}
              <div className="sm:col-span-2">{row(tf("registered_address"), org.registered_address)}</div>
              <div className="sm:col-span-2">{row(tf("activity_description"), org.activity_description)}</div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">{t("contact")}</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {row(tf("contact_name"), app.contact_name)}
              {row(tf("contact_title"), app.contact_title)}
              {row(tf("contact_phone"), app.contact_phone, true)}
              {row(tf("contact_email"), app.contact_email, true)}
              {row(tf("declaration"), app.declaration_accepted_at ? dateFmt.format(new Date(app.declaration_accepted_at)) : null)}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">{tf("documents")}</h2>
            {(docs ?? []).length === 0 ? (
              <p className="text-sm text-muted">{t("none")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {(docs as Doc[]).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="block font-bold">{td.has(d.document_type) ? td(d.document_type) : d.document_type}</span>
                      <span className="text-xs text-muted">
                        {d.file_name} · {Math.ceil(d.size_bytes / 1024)} KB{d.issuing_country ? ` · ${d.issuing_country}` : ""}
                        {d.document_expiry_date ? ` · ${d.document_expiry_date}` : ""}
                      </span>
                    </span>
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-accent">
                      {t("open")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(services ?? []).length > 0 && (
            <Card>
              <h2 className="mb-3 font-bold">{tp("shippingSection")}</h2>
              <ul className="flex flex-col divide-y divide-line text-sm">
                {((services ?? []) as CarrierService[]).map((sv) => (
                  <li key={sv.id} className="flex flex-col gap-0.5 py-2">
                    <span className="font-bold">{sv.name} · {tm(sv.mode)}</span>
                    <span className="text-muted">
                      <span className="ltr-value">{sv.origin_countries.join(",")} → {sv.destination_countries.join(",")}</span>
                      {sv.pickup_location && ` · ${sv.pickup_location}`}
                      {sv.price_per_kg && sv.price_currency && <> · <span className="ltr-value">{formatMoney(sv.price_per_kg, sv.price_currency, locale)}</span>/{tcar("kg")}</>}
                      {sv.min_charge && sv.price_currency && <> · {tcar("minCharge")}: <span className="ltr-value">{formatMoney(sv.min_charge, sv.price_currency, locale)}</span></>}
                      {(sv.transit_days_min ?? sv.transit_days_max) !== null && ` · ${sv.transit_days_min ?? "?"}–${sv.transit_days_max ?? "?"} ${tcar("days")}`}
                    </span>
                    {sv.notes && <span className="text-muted">{sv.notes}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-bold">{tp("bankSection")}</h2>
            {!bank ? (
              <p className="text-sm text-muted">{tp("bankNone")}</p>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                {row(tp("bankName"), bank.bank_name)}
                {row(tp("bankHolder"), bank.account_holder)}
                {row("IBAN", bank.iban, true)}
                {row(tp("bankAccountNumber"), bank.account_number, true)}
                {row("SWIFT / BIC", bank.swift, true)}
                {row(tcar("currency"), bank.currency, true)}
              </dl>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">{t("history")}</h2>
            {(reviews ?? []).length === 0 ? (
              <p className="text-sm text-muted">{t("none")}</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {(reviews as Review[]).map((r) => (
                  <li key={r.id} className="border-s-2 border-line ps-3">
                    <span className="font-bold">{t(decisionLabels[r.decision] ?? "startReview")}</span>
                    <span className="text-muted"> · {(r.reviewer_id && names.get(r.reviewer_id)) || "—"} · {dateFmt.format(new Date(r.created_at))}</span>
                    {r.approved_capabilities.length > 0 && <span className="block">✓ {r.approved_capabilities.map((c) => tc(c)).join("، ")}</span>}
                    {r.rejected_capabilities.length > 0 && <span className="block">✗ {r.rejected_capabilities.map((c) => tc(c)).join("، ")}</span>}
                    {r.reason && <span className="block">{r.reason}</span>}
                    {r.override_reason && <span className="block text-danger">{t("override")}: {r.override_reason}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-bold">{t("capabilities")}</h2>
            <ul className="flex flex-col gap-2">
              {org.ap_organization_verifications.map((v) => (
                <li key={v.capability} className="flex items-center justify-between gap-2 text-sm">
                  {tc(v.capability)}
                  <Badge tone={statusTone(v.status)}>{tcs(v.status)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-2 text-sm">
            <h2 className="font-bold">{t("checklist")}</h2>
            {missing.length === 0 ? <Alert tone="success">{t("complete")}</Alert> : <Alert tone="danger">{t("missing")} {missing.map((m) => tf(m)).join("، ")}</Alert>}
            <p className="text-muted">{t("checklistNote")}</p>
          </Card>

          {!reviewable ? (
            <p className="text-sm text-muted">{t("notReviewable")}</p>
          ) : (
            <>
              {app.status !== "under_review" && (
                <form action={startReview}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={app.id} />
                  <SubmitButton variant="secondary" className="w-full">
                    {t("startReview")}
                  </SubmitButton>
                </form>
              )}
              <Card>
                <form action={reviewApplication} className="flex flex-col gap-4">
                  <h2 className="font-bold">{t("decision")}</h2>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={app.id} />
                  <fieldset className="flex flex-col gap-2">
                    {(["approved", "changes_requested", "rejected"] as const).map((d) => (
                      <label key={d} className="flex items-center gap-2">
                        <input type="radio" name="decision" value={d} required />
                        {t(decisionLabels[d])}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">{t("approveCaps")}</legend>
                    {requested.map((v) => (
                      <label key={v.capability} className="flex items-center gap-2">
                        <input type="checkbox" name="approve" value={v.capability} />
                        {tc(v.capability)}
                      </label>
                    ))}
                  </fieldset>
                  <Field label={t("reason")} htmlFor="reason">
                    <Textarea id="reason" name="reason" maxLength={2000} />
                  </Field>
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">{t("requestedFields")}</legend>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      {applicationFields.map((f) => (
                        <label key={f} className="flex items-center gap-2">
                          <input type="checkbox" name="fields" value={f} />
                          {tf(f)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {missing.length > 0 && (
                    <Field label={t("override")} htmlFor="override">
                      <Input id="override" name="override" maxLength={1000} />
                    </Field>
                  )}
                  <SubmitButton>{t("submitDecision")}</SubmitButton>
                </form>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
