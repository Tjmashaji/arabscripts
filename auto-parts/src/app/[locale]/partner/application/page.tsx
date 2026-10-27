import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { localePath, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { removeDocument, saveApplication, saveBankAccount, submitApplication, uploadDocument } from "@/server/partner-actions";
import { CountrySelect } from "@/components/country-select";
import { CarrierServiceForm, type CarrierService } from "@/components/carrier-service-form";
import { currencies, formatMoney } from "@/lib/catalog";
import { accountKinds, capabilities, countries, documentTypes, editableStatuses, type ApplicationStatus } from "@/lib/partners";
import { localeFrom, localeNames, locales } from "@/i18n/locales";
import { AiFill } from "@/components/ai-fill";
import { aiConfigured } from "@/lib/ai-fill";

type Org = {
  id: string; account_kind: "company" | "individual"; registration_number: string | null; vat_number: string | null; city: string | null;
  legal_name: string; trade_name: string | null; entity_type: string | null; country_code: string; registered_address: string | null;
  operating_country: string | null; website: string | null; activity_description: string | null; billing_currency: string | null;
  ap_organization_verifications: { capability: string; status: string; decision_reason: string | null }[];
};
type Doc = { id: string; document_type: string; file_name: string; size_bytes: number; issuing_country: string | null; document_expiry_date: string | null; status: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partner" }))("applicationTitle") };
}

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; missing?: string; submitted?: string; started?: string; bankSaved?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/partner/application");
  const q = await searchParams;
  const t = await getTranslations("partner");
  const tf = await getTranslations("fields");
  const tc = await getTranslations("capabilities");
  const tcs = await getTranslations("capStatus");
  const tas = await getTranslations("appStatus");
  const td = await getTranslations("docTypes");
  const supabase = await createClient();

  const { data: app } = await supabase
    .from("ap_partner_applications")
    .select(`id, status, contact_name, contact_title, contact_phone, contact_email, languages, declaration_accepted_at, decision_reason,
      organization:ap_organizations(id, account_kind, registration_number, vat_number, city, legal_name, trade_name, entity_type, country_code, registered_address, operating_country, website,
        activity_description, billing_currency, ap_organization_verifications(capability, status, decision_reason))`)
    .eq("submitted_by", session.userId)
    .maybeSingle();
  if (!app) redirect(localePath(locale, "/partner"));

  const [{ data: docs }, { data: changes }, { data: missingNow }, { data: bank }, { data: services }] = await Promise.all([
    supabase.from("ap_verification_documents").select("id, document_type, file_name, size_bytes, issuing_country, document_expiry_date, status")
      .eq("application_id", app.id).order("created_at"),
    supabase.from("ap_application_change_requests").select("note, requested_fields").eq("application_id", app.id).is("resolved_at", null),
    supabase.rpc("ap_application_missing", { p_app: app.id }),
    supabase.from("ap_organization_bank_accounts").select("bank_name, account_holder, iban, account_number, swift, currency")
      .eq("organization_id", (app.organization as unknown as { id: string }).id).maybeSingle(),
    supabase.from("ap_carrier_services").select("*").eq("organization_id", (app.organization as unknown as { id: string }).id).order("created_at"),
  ]);
  const org = app.organization as unknown as Org;
  const editable = editableStatuses.includes(app.status as ApplicationStatus);
  const requested = new Set(org.ap_organization_verifications.map((v) => v.capability));
  const individual = org.account_kind === "individual";
  const ai = aiConfigured();
  const carrierCap = org.ap_organization_verifications.find((v) => v.capability === "carrier" && (v.status === "requested" || v.status === "approved"));
  const todo = editable ? ((missingNow ?? []) as string[]) : [];
  const tm = await getTranslations("shippingModes");
  const tcar = await getTranslations("carrier");
  const missing = q.missing?.split(",").filter(Boolean) ?? [];
  const textField = (name: keyof Org | "contact_name" | "contact_title" | "contact_phone" | "contact_email", value: string | null, opts: { required?: boolean; dir?: "ltr"; type?: string; list?: string; textarea?: boolean; label?: string; hint?: string } = {}) => (
    <Field label={opts.label ?? tf(name)} hint={opts.hint} htmlFor={name}>
      {opts.textarea ? (
        <Textarea id={name} name={name} defaultValue={value ?? ""} disabled={!editable} maxLength={2000} />
      ) : (
        <Input id={name} name={name} defaultValue={value ?? ""} disabled={!editable} required={opts.required} dir={opts.dir}
          type={opts.type} list={opts.list} maxLength={500} />
      )}
    </Field>
  );

  return (
    <SiteShell locale={locale} path="/partner/application">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle>{t("applicationTitle")}</PageTitle>
          <Badge tone={statusTone(app.status)}>{tas(app.status)}</Badge>
        </div>
        {q.started && <Alert tone="success">{t("started")}</Alert>}
        {q.saved && <Alert tone="success">{t("saved")}</Alert>}
        {q.bankSaved && <Alert tone="success">{t("bankSaved")}</Alert>}
        {q.submitted && <Alert tone="success">{t("submitted")}</Alert>}
        {q.error === "upload" && <Alert tone="danger">{t("uploadFailed")}</Alert>}
        {q.error && q.error !== "upload" && <Alert tone="danger">{t("actionFailed")}{tf.has(q.error) ? ` (${tf(q.error)})` : ""}</Alert>}
        {missing.length > 0 && <Alert tone="danger">{t("missing")} {missing.map((m) => (tf.has(m) ? tf(m) : m)).join("، ")}</Alert>}
        {todo.length > 0 && missing.length === 0 && (
          <Card className="flex flex-col gap-2 border-accent/40">
            <h2 className="font-bold">{t("todoTitle")}</h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {todo.map((m) => <li key={m}><Badge tone="danger">{tf.has(m) ? tf(m) : m}</Badge></li>)}
            </ul>
          </Card>
        )}
        {(changes ?? []).map((c, i) => (
          <Alert key={i} tone="info">
            <span className="font-bold">{t("changesTitle")} </span>
            {c.note}
            {(c.requested_fields as string[]).length > 0 && ` (${(c.requested_fields as string[]).map((f) => (tf.has(f) ? tf(f) : f)).join("، ")})`}
          </Alert>
        ))}
        {!editable && app.decision_reason && <Alert tone="info">{t("decisionTitle")}: {app.decision_reason}</Alert>}
        {!editable && <p className="text-sm text-muted">{t("readOnly")}</p>}

        <form action={saveApplication} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          {editable && ai && <AiFill profile="partner_application" locale={locale} />}
          <Card className="flex flex-col gap-3">
            <h2 className="font-bold">{t("kindTitle")}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {accountKinds.map((k) => (
                <label key={k} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="account_kind" value={k} defaultChecked={org.account_kind === k} disabled={!editable} className="mt-1 accent-accent" />
                  <span><span className="block font-bold">{t(`kinds.${k}`)}</span><span className="text-muted">{t(`kindHints.${k}`)}</span></span>
                </label>
              ))}
            </div>
            {!editable && <input type="hidden" name="account_kind" value={org.account_kind} />}
            <p className="text-xs text-muted">{t("kindSwitch")}</p>
          </Card>

          <Card className="grid gap-4 sm:grid-cols-2">
            <h2 className="font-bold sm:col-span-2">{individual ? t("personSection") : t("orgSection")}</h2>
            {textField("legal_name", org.legal_name, { required: true, label: individual ? tf("full_name") : tf("legal_name") })}
            {!individual && textField("trade_name", org.trade_name)}
            {!individual && textField("registration_number", org.registration_number, { dir: "ltr" })}
            {!individual && textField("vat_number", org.vat_number, { dir: "ltr" })}
            {!individual && textField("entity_type", org.entity_type)}
            <Field label={tf("country_code")} htmlFor="country_code">
              <CountrySelect name="country_code" locale={locale} defaultValue={org.country_code} required disabled={!editable} placeholder={tf("country_code")} />
            </Field>
            {textField("city", org.city)}
            {!individual && (
              <Field label={tf("operating_country")} htmlFor="operating_country">
                <CountrySelect name="operating_country" locale={locale} defaultValue={org.operating_country} disabled={!editable} placeholder="—" />
              </Field>
            )}
            {textField("billing_currency", org.billing_currency, { dir: "ltr" })}
            {textField("website", org.website, { dir: "ltr", type: "url" })}
            <div className="sm:col-span-2">{textField("registered_address", org.registered_address, { textarea: true, label: individual ? tf("address") : tf("registered_address") })}</div>
            <div className="sm:col-span-2">{textField("activity_description", org.activity_description, { textarea: true, label: individual ? tf("work_field") : tf("activity_description") })}</div>
            <datalist id="countries">
              {countries.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Card>

          <Card className="grid gap-4 sm:grid-cols-2">
            <h2 className="font-bold sm:col-span-2">{t("contactSection")}</h2>
            {!individual && textField("contact_name", app.contact_name)}
            {!individual && textField("contact_title", app.contact_title)}
            {textField("contact_phone", app.contact_phone, { dir: "ltr", type: "tel" })}
            {textField("contact_email", app.contact_email, { dir: "ltr", type: "email" })}
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-bold">{tf("languages")}</legend>
              <div className="flex flex-wrap gap-4">
                {locales.map((l) => (
                  <label key={l} className="flex items-center gap-2">
                    <input type="checkbox" name="languages" value={l} defaultChecked={(app.languages as string[]).includes(l)} disabled={!editable} />
                    <span lang={l}>{localeNames[l]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-bold">{t("capSection")}</h2>
            <p className="text-sm text-muted">{t("noApproval")}</p>
            <div className="flex flex-wrap gap-4">
              {capabilities.map((c) => {
                const v = org.ap_organization_verifications.find((x) => x.capability === c);
                const locked = !!v && v.status !== "requested";
                return (
                  <label key={c} className="flex items-center gap-2">
                    <input type="checkbox" name="capabilities" value={c} defaultChecked={requested.has(c)} disabled={!editable || locked} />
                    {tc(c)}
                    {v && v.status !== "requested" && <Badge tone={statusTone(v.status)}>{tcs(v.status)}</Badge>}
                  </label>
                );
              })}
            </div>
          </Card>

          <Card>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="declaration" defaultChecked={!!app.declaration_accepted_at} disabled={!editable} className="mt-1" />
              <span className="text-sm">{t("declarationText")}</span>
            </label>
          </Card>

          {editable && (
            <div>
              <SubmitButton>{t("save")}</SubmitButton>
            </div>
          )}
        </form>

        <Card className="flex flex-col gap-4" id="documents">
          <h2 className="font-bold">{t("docsSection")}</h2>
          <p className="text-sm">{individual ? t("docsNeededIndividual") : t("docsNeededCompany")}</p>
          <p className="text-sm text-muted">{t("docsHelp")}</p>
          {(docs ?? []).length === 0 ? (
            <p className="text-sm text-muted">{t("noDocs")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {(docs as Doc[]).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="block font-bold">{td.has(d.document_type) ? td(d.document_type) : d.document_type}</span>
                    <span className="text-xs text-muted">
                      {d.file_name} · {Math.ceil(d.size_bytes / 1024)} KB{d.issuing_country ? ` · ${d.issuing_country}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-accent">
                      {t("open")}
                    </a>
                    {editable && (
                      <form action={removeDocument}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="documentId" value={d.id} />
                        <SubmitButton variant="danger" className="min-h-9">
                          {t("remove")}
                        </SubmitButton>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <form action={uploadDocument} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <input type="hidden" name="locale" value={locale} />
              <Field label={t("docType")} htmlFor="documentType">
                <Select id="documentType" name="documentType" required>
                  {documentTypes.map((d) => (
                    <option key={d} value={d}>
                      {td(d)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("docFile")} htmlFor="file">
                <Input id="file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="py-2" />
              </Field>
              <Field label={t("docCountry")} htmlFor="issuingCountry">
                <CountrySelect name="issuingCountry" locale={locale} defaultValue={org.country_code} placeholder="—" />
              </Field>
              <Field label={t("docExpiry")} htmlFor="expiry">
                <Input id="expiry" name="expiry" type="date" dir="ltr" />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary">{t("upload")}</SubmitButton>
              </div>
            </form>
          )}
        </Card>

        {carrierCap && (
          <Card className="flex flex-col gap-4" id="shipping">
            <h2 className="font-bold">{t("shippingSection")}</h2>
            <p className="text-sm text-muted">{t("shippingHelp")}</p>
            {((services ?? []) as CarrierService[]).map((sv) => (
              <details key={sv.id} className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm">
                  <span className="font-bold">{sv.name}</span> · {tm(sv.mode)} · <span className="ltr-value">{sv.origin_countries.join(",")} → {sv.destination_countries.join(",")}</span>
                  {sv.price_per_kg && sv.price_currency && <> · <span className="ltr-value">{formatMoney(sv.price_per_kg, sv.price_currency, locale)}</span>/{tcar("kg")}</>}
                </summary>
                <div className="mt-3"><CarrierServiceForm locale={locale} orgs={[{ id: org.id, name: org.legal_name }]} service={sv} back="application" /></div>
              </details>
            ))}
            <details className="rounded-lg border border-dashed border-line p-3" open={(services ?? []).length === 0}>
              <summary className="cursor-pointer text-sm font-bold">{tcar("addService")}</summary>
              <div className="mt-3"><CarrierServiceForm locale={locale} orgs={[{ id: org.id, name: org.legal_name }]} back="application" /></div>
            </details>
          </Card>
        )}

        <Card className="flex flex-col gap-4" id="bank">
          <h2 className="font-bold">{t("bankSection")}</h2>
          <p className="text-sm text-muted">{t("bankHelp")}</p>
          {q.error === "bank" && <Alert tone="danger">{t("bankInvalid")}</Alert>}
          <form action={saveBankAccount} className="grid gap-4 sm:grid-cols-2">
            {ai && <AiFill profile="bank" locale={locale} />}
            <input type="hidden" name="locale" value={locale} />
            <Field label={t("bankName")} htmlFor="bankName"><Input id="bankName" name="bankName" maxLength={120} defaultValue={bank?.bank_name ?? ""} /></Field>
            <Field label={t("bankHolder")} htmlFor="holder"><Input id="holder" name="holder" maxLength={200} defaultValue={bank?.account_holder ?? org.legal_name} /></Field>
            <Field label="IBAN" htmlFor="iban"><Input id="iban" name="iban" dir="ltr" maxLength={60} defaultValue={bank?.iban ?? ""} placeholder="SA00 0000 0000 0000 0000 0000" /></Field>
            <Field label={t("bankAccountNumber")} hint={t("bankAccountHint")} htmlFor="accountNumber"><Input id="accountNumber" name="accountNumber" dir="ltr" maxLength={40} defaultValue={bank?.account_number ?? ""} /></Field>
            <Field label="SWIFT / BIC" htmlFor="swift"><Input id="swift" name="swift" dir="ltr" maxLength={20} defaultValue={bank?.swift ?? ""} /></Field>
            <Field label={tcar("currency")} htmlFor="bankCurrency">
              <Select id="bankCurrency" name="currency" defaultValue={bank?.currency ?? ""}>
                <option value="">—</option>
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <SubmitButton variant="secondary">{t("bankSave")}</SubmitButton>
              <span className="text-xs text-muted">{t("bankClearHint")}</span>
            </div>
          </form>
        </Card>

        {editable && (
          <form action={submitApplication}>
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton className="w-full">{t("submit")}</SubmitButton>
          </form>
        )}
      </div>
    </SiteShell>
  );
}
