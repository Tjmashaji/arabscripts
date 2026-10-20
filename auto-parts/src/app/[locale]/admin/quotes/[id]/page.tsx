import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SubmitButton } from "@/components/submit-button";
import { QuoteBreakdown, type QuoteLineRow } from "@/components/quote-breakdown";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { formatMoney, localName } from "@/lib/catalog";
import { adminSettableStatuses, costLineCodes, isExpired, lineStatuses, linesTotal, openRequestStatuses } from "@/lib/quotes";
import {
  createCustomerQuote, issueCustomerQuote, saveQuoteLines, sendToSuppliers, updateRequestStatus,
} from "@/server/quote-actions";
import { addShippingQuote, applyShippingQuote, requestShippingQuote } from "@/server/shipping-actions";
import { chargeableWeight, shippingModes } from "@/lib/shipping";
import { currencies } from "@/lib/catalog";
import { countries } from "@/lib/partners";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type SupplierQuote = {
  id: string; organization_id: string; part_type: string; unit_price: string; currency: string; quantity_available: number | null;
  lead_time_days: number | null; origin_country: string | null; valid_until: string; compatibility_notes: string | null; status: string;
  updated_at: string;
};
type CustomerQuote = {
  id: string; version: number; status: string; currency: string; total: string | null; valid_until: string | null; issued_at: string | null;
  supplier_quote_id: string | null; estimated_delivery_days: number | null; cancellation_terms: string | null; seller_of_record: string | null;
  notes: string | null; ap_customer_quote_lines: QuoteLineRow[];
};
type ShippingQuote = {
  id: string; carrier_id: string | null; carrier_name: string | null; mode: string; origin_country: string; origin_city: string | null;
  destination_city: string; pieces: number; weight_kg: string; volumetric_weight_kg: string | null; price: string | null; currency: string | null;
  delivery_estimate_days: number | null; valid_until: string | null; provider_quote_reference: string | null; pricing_source: string; status: string;
};
type Org = { id: string; legal_name: string; trade_name: string | null; country_code: string; ap_organization_verifications: { capability: string; status: string }[] };

const EXTRA_ROWS = 4;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminQuotes" }))("title") };
}

async function loadNow() {
  return Date.now();
}

// مكتب التسعير: إرسال الطلب لموردين، مقارنة عروضهم، بناء تسعيرة مفصّلة بإصدارات ثم إصدارها للعميل.
export default async function AdminQuote({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ done?: string; saved?: string; issued?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("adminQuotes");
  const tq = await getTranslations("quotes");
  const tc = await getTranslations("catalog");
  const ts = await getTranslations("requestStatus");
  const tsq = await getTranslations("supplierQuoteStatus");
  const tcq = await getTranslations("customerQuoteStatus");
  const tl = await getTranslations("costLines");
  const tp = await getTranslations("partTypes");
  const tsh = await getTranslations("shipping");
  const tm = await getTranslations("shippingModes");
  const tshq = await getTranslations("shippingQuoteStatus");
  const session = await requireStaff(locale, `/admin/quotes/${id}`, "quotes.manage");
  const canShip = session.permissions.has("shipping.manage");
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("ap_quote_requests")
    .select("*, ap_quote_request_media(id), ap_quote_request_suppliers(organization_id, share_vin, invited_at)")
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();
  const [{ data: sqRows }, { data: cqRows }, { data: orgRows }, { data: product }, { data: shqRows }, { data: feeRow }] = await Promise.all([
    supabase.from("ap_supplier_quotes").select("*").eq("request_id", id).order("unit_price"),
    supabase.from("ap_customer_quotes")
      .select("id, version, status, currency, total, valid_until, issued_at, supplier_quote_id, estimated_delivery_days, cancellation_terms, seller_of_record, notes, ap_customer_quote_lines(id, code, description, quantity, unit_amount, amount, status, source, beneficiary, sort_order)")
      .eq("request_id", id).order("version", { ascending: false }),
    supabase.from("ap_organizations").select("id, legal_name, trade_name, country_code, ap_organization_verifications(capability, status)").eq("status", "active").order("legal_name"),
    req.product_id ? supabase.from("ap_products").select("id, name").eq("id", req.product_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("ap_shipping_quotes").select("*").eq("request_id", id).order("created_at"),
    supabase.from("ap_platform_settings").select("value").eq("key", "service_fee_percent").maybeSingle(),
  ]);
  const shippingQuotes = (shqRows ?? []) as ShippingQuote[];
  const feePercent = Number(feeRow?.value ?? 0) || 0;
  const carriers = ((orgRows ?? []) as Org[]).filter((o) => o.ap_organization_verifications.some((v) => v.status === "approved" && v.capability === "carrier"));
  const supplierQuotes = (sqRows ?? []) as SupplierQuote[];
  const customerQuotes = (cqRows ?? []) as CustomerQuote[];
  const orgs = ((orgRows ?? []) as Org[]).filter((o) =>
    o.ap_organization_verifications.some((v) => v.status === "approved" && ["seller", "supplier", "manufacturer"].includes(v.capability)));
  const orgName = new Map(((orgRows ?? []) as Org[]).map((o) => [o.id, o.trade_name || o.legal_name]));
  const invited = req.ap_quote_request_suppliers as { organization_id: string; share_vin: boolean; invited_at: string }[];
  const invitedIds = new Set(invited.map((i) => i.organization_id));
  const media = req.ap_quote_request_media as { id: string }[];
  const draft = customerQuotes.find((c) => c.status === "draft");
  const history = customerQuotes.filter((c) => c.status !== "draft");
  const isOpen = (openRequestStatuses as readonly string[]).includes(req.status);
  const { brands, models } = await getCatalog();
  const brand = brands.find((b) => b.id === req.brand_id);
  const model = models.find((m) => m.id === req.model_id);
  const now = await loadNow();
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={req.id} />
    </>
  );
  const parcelFields = (
    <>
      <Select name="mode" aria-label={tsh("mode")} defaultValue="air">{shippingModes.map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select>
      <Select name="originCountry" aria-label={tsh("originCountry")} defaultValue="CN">{countries.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
      <Input name="originCity" placeholder={tsh("originCity")} aria-label={tsh("originCity")} maxLength={80} />
      <Input name="destinationCity" placeholder={tsh("destinationCity")} aria-label={tsh("destinationCity")} defaultValue={req.city} maxLength={80} />
      <Input name="pieces" type="number" min={1} defaultValue={1} placeholder={tsh("piecesLabel")} aria-label={tsh("piecesLabel")} />
      <Input name="weightKg" required inputMode="decimal" dir="ltr" placeholder={tsh("weightKg")} aria-label={tsh("weightKg")} />
      <Input name="volumetricKg" inputMode="decimal" dir="ltr" placeholder={tsh("volumetricKg")} aria-label={tsh("volumetricKg")} />
    </>
  );
  const draftLines = draft ? [...draft.ap_customer_quote_lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
  const rows = draftLines.length + EXTRA_ROWS;

  return (
    <div className="flex flex-col gap-5">
      <Link href={{ pathname: "/admin/quotes", query: { status: req.status } }} className="text-sm text-accent">← {t("title")}</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle><span className="ltr-value">{req.reference}</span></PageTitle>
        <Badge tone={statusTone(req.status)}>{ts(req.status)}</Badge>
      </div>
      {(q.done || q.saved) && <Alert tone="success">{t("done")}</Alert>}
      {q.issued && <Alert tone="success">{t("issued")}</Alert>}
      {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">{tq("requestDetails")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-muted">{tq("description")}</dt><dd className="whitespace-pre-line">{req.description}</dd></div>
            {product && <div className="sm:col-span-2"><dt className="text-xs text-muted">{tq("forProduct")}</dt><dd><Link href={`/products/${product.id}`} target="_blank" className="text-accent">{product.name}</Link></dd></div>}
            <div><dt className="text-xs text-muted">{tc("brand")} / {tc("model")}</dt><dd>{[brand && localName(brand, locale), model && modelLabel(model, locale)].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("year")} / {tc("engine")}</dt><dd className="ltr-value">{[req.vehicle_year, req.engine].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tq("vin")}</dt><dd className="ltr-value">{req.vin ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tq("partNumber")}</dt><dd className="ltr-value">{req.part_number ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("quantity")}</dt><dd>{req.quantity}</dd></div>
            <div><dt className="text-xs text-muted">{tq("city")}</dt><dd>{req.city}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("customerContact")}</dt><dd>{req.contact_name} · <span className="ltr-value">{req.contact_phone}</span></dd></div>
          </dl>
          {media.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={m.id}>
                  <a href={`/api/request-media/${m.id}?request=${req.id}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1 text-sm text-accent">{tq("photo")} {i + 1}</a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">{t("statusTitle")}</h2>
          {req.admin_notes && <p className="mb-3 whitespace-pre-line text-sm">{req.admin_notes}</p>}
          {isOpen ? (
            <form action={updateRequestStatus} className="flex flex-col gap-3">
              {hidden}
              <Select name="status" aria-label={t("statusTitle")} defaultValue="reviewing">
                {adminSettableStatuses.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
              </Select>
              <Textarea name="notes" placeholder={t("internalNotes")} aria-label={t("internalNotes")} maxLength={2000} />
              <div><SubmitButton variant="secondary">{t("apply")}</SubmitButton></div>
            </form>
          ) : (
            <p className="text-sm text-muted">{t("closed")}</p>
          )}
        </Card>
      </div>

      <Card id="suppliers" className="flex flex-col gap-3">
        <h2 className="font-bold">{t("suppliersTitle")}</h2>
        {invited.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-sm">
            {invited.map((i) => (
              <li key={i.organization_id}><Badge tone="neutral">{orgName.get(i.organization_id) ?? "—"}{i.share_vin ? ` · ${t("vinShared")}` : ""}</Badge></li>
            ))}
          </ul>
        )}
        {isOpen && (orgs.length === 0 ? (
          <p className="text-sm text-muted">{t("noEligible")}</p>
        ) : (
          <form action={sendToSuppliers} className="flex flex-col gap-3">
            {hidden}
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm text-muted">{t("pickSuppliers")}</legend>
              {orgs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="orgs" value={o.id} defaultChecked={invitedIds.has(o.id)} className="size-4 accent-accent" />
                  {o.trade_name || o.legal_name} <span className="ltr-value text-xs text-muted">{o.country_code}</span>
                </label>
              ))}
            </fieldset>
            {req.vin && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="shareVin" className="mt-1 size-4 accent-accent" />
                <span>{t("shareVin")}</span>
              </label>
            )}
            <div><SubmitButton variant="secondary">{t("send")}</SubmitButton></div>
          </form>
        ))}
      </Card>

      <Card id="compare" className="flex flex-col gap-3">
        <h2 className="font-bold">{t("compareTitle")}</h2>
        {supplierQuotes.length === 0 ? (
          <p className="text-sm text-muted">{t("noSupplierQuotes")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 text-start font-normal">{t("supplier")}</th>
                  <th className="py-2 text-start font-normal">{tc("partType")}</th>
                  <th className="py-2 text-start font-normal">{tc("price")}</th>
                  <th className="py-2 text-start font-normal">{tc("quantity")}</th>
                  <th className="py-2 text-start font-normal">{tc("leadTime")}</th>
                  <th className="py-2 text-start font-normal">{tc("origin")}</th>
                  <th className="py-2 text-start font-normal">{tq("validUntil")}</th>
                  <th className="py-2 text-start font-normal">{t("status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {supplierQuotes.map((s) => {
                  const expired = isExpired(s.valid_until, now);
                  return (
                    <tr key={s.id} className="border-b border-line/60 align-top">
                      <td className="py-2">
                        {orgName.get(s.organization_id) ?? "—"}
                        {s.compatibility_notes && <p className="text-xs text-muted">{s.compatibility_notes}</p>}
                      </td>
                      <td className="py-2">{tp(s.part_type)}</td>
                      <td className="py-2 font-bold ltr-value">{formatMoney(s.unit_price, s.currency, locale)}</td>
                      <td className="py-2">{s.quantity_available ?? tc("unknown")}</td>
                      <td className="py-2">{s.lead_time_days != null ? tc("days", { count: s.lead_time_days }) : "—"}</td>
                      <td className="py-2 ltr-value">{s.origin_country ?? "—"}</td>
                      <td className="py-2">{dateFmt.format(new Date(s.valid_until))}</td>
                      <td className="py-2"><Badge tone={expired ? "danger" : statusTone(s.status)}>{expired ? tsq("expired") : tsq(s.status)}</Badge></td>
                      <td className="py-2">
                        {isOpen && !draft && !expired && ["submitted", "selected"].includes(s.status) && (
                          <form action={createCustomerQuote}>
                            {hidden}
                            <input type="hidden" name="supplierQuoteId" value={s.id} />
                            <SubmitButton variant="secondary" className="min-h-9">{t("useQuote")}</SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {supplierQuotes.some((s) => s.currency !== "SAR") && <p className="text-xs text-muted">{t("currencyNote")}</p>}
      </Card>

      <Card id="shipping" className="flex flex-col gap-3">
        <h2 className="font-bold">{tsh("quotesTitle")}</h2>
        {shippingQuotes.length === 0 ? (
          <p className="text-sm text-muted">{tsh("noQuotes")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shippingQuotes.map((s) => {
              const expired = isExpired(s.valid_until, now);
              const usable = draft && !expired && ["submitted", "selected"].includes(s.status) && s.price;
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{s.carrier_id ? orgName.get(s.carrier_id) ?? "—" : s.carrier_name} · {tm(s.mode)}</span>
                    <Badge tone={expired && s.status !== "requested" ? "danger" : statusTone(s.status === "requested" ? "opened" : s.status)}>
                      {expired && s.status !== "requested" ? tshq("expired") : tshq(s.status)}
                    </Badge>
                  </div>
                  <p className="text-muted">
                    <span className="ltr-value">{s.origin_country}</span>{s.origin_city && ` ${s.origin_city}`} → {s.destination_city} ·{" "}
                    {tsh("kg", { value: chargeableWeight(s.weight_kg, s.volumetric_weight_kg) ?? 0 })} · {tsh("pieces", { count: s.pieces })}
                    {s.provider_quote_reference && <> · <span className="ltr-value">{s.provider_quote_reference}</span></>}
                  </p>
                  {s.price && s.currency && (
                    <p>
                      <span className="font-bold ltr-value">{formatMoney(s.price, s.currency, locale)}</span>
                      {s.delivery_estimate_days != null && <> · {tc("days", { count: s.delivery_estimate_days })}</>}
                      {s.valid_until && <> · {tq("validUntil")} {dateFmt.format(new Date(s.valid_until))}</>}
                    </p>
                  )}
                  {usable && (
                    <form action={applyShippingQuote} className="flex flex-wrap items-end gap-2">
                      {hidden}
                      <input type="hidden" name="shippingQuoteId" value={s.id} />
                      <input type="hidden" name="quoteId" value={draft.id} />
                      {s.currency !== draft.currency && (
                        <>
                          <Input name="amountSar" required inputMode="decimal" dir="ltr" placeholder={tsh("amountSar")} aria-label={tsh("amountSar")} className="w-36" />
                          <Input name="fxNote" required placeholder={tsh("fxNote")} aria-label={tsh("fxNote")} maxLength={150} className="min-w-48 flex-1" />
                        </>
                      )}
                      <SubmitButton variant="secondary" className="min-h-9">{tsh("applyToQuote")}</SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!draft && shippingQuotes.some((s) => s.price) && <p className="text-xs text-muted">{tsh("needDraft")}</p>}
        {canShip && isOpen && (
          <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-bold">{tsh("requestFromCarrier")}</summary>
              {carriers.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{tsh("noCarriers")}</p>
              ) : (
                <form action={requestShippingQuote} className="mt-3 grid gap-2 sm:grid-cols-2">
                  {hidden}
                  <Select name="carrierId" aria-label={tsh("carrier")} className="sm:col-span-2">
                    {carriers.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
                  </Select>
                  {parcelFields}
                  <Input name="lengthCm" inputMode="decimal" dir="ltr" placeholder={tsh("lengthCm")} aria-label={tsh("lengthCm")} />
                  <Input name="widthCm" inputMode="decimal" dir="ltr" placeholder={tsh("widthCm")} aria-label={tsh("widthCm")} />
                  <Input name="heightCm" inputMode="decimal" dir="ltr" placeholder={tsh("heightCm")} aria-label={tsh("heightCm")} />
                  <Input name="notes" placeholder={tsh("note")} aria-label={tsh("note")} maxLength={1000} />
                  <div><SubmitButton variant="secondary">{tsh("sendRequest")}</SubmitButton></div>
                </form>
              )}
            </details>
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-bold">{tsh("addManual")}</summary>
              <form action={addShippingQuote} className="mt-3 grid gap-2 sm:grid-cols-2">
                {hidden}
                <Input name="carrierName" required placeholder={tsh("carrierName")} aria-label={tsh("carrierName")} maxLength={120} className="sm:col-span-2" />
                {parcelFields}
                <Input name="price" required inputMode="decimal" dir="ltr" placeholder={tsh("price")} aria-label={tsh("price")} />
                <Select name="currency" aria-label={tsh("currency")} defaultValue="SAR">{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                <Input name="days" type="number" min={1} max={365} placeholder={tsh("etaDays")} aria-label={tsh("etaDays")} />
                <Input name="validUntil" type="date" required dir="ltr" aria-label={tq("validUntil")} />
                <Input name="reference" dir="ltr" placeholder={tsh("reference")} aria-label={tsh("reference")} maxLength={120} />
                <Input name="notes" placeholder={tsh("note")} aria-label={tsh("note")} maxLength={1000} />
                <div><SubmitButton variant="secondary">{tsh("save")}</SubmitButton></div>
              </form>
            </details>
          </div>
        )}
      </Card>

      <Card id="draft" className="flex flex-col gap-4">
        <h2 className="font-bold">{t("draftTitle")}</h2>
        {!draft ? (
          isOpen ? (
            <form action={createCustomerQuote}>
              {hidden}
              <SubmitButton variant="secondary">{t("newDraft")}</SubmitButton>
            </form>
          ) : <p className="text-sm text-muted">{t("closed")}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {tq("quoteVersion", { version: draft.version })}
              {draft.supplier_quote_id && <> · {t("basedOn")}: {orgName.get(supplierQuotes.find((s) => s.id === draft.supplier_quote_id)?.organization_id ?? "") ?? "—"}</>}
            </p>
            <form action={saveQuoteLines} className="flex flex-col gap-3">
              {hidden}
              <input type="hidden" name="quoteId" value={draft.id} />
              <input type="hidden" name="rows" value={rows} />
              <p className="text-xs text-muted">{t("linesHelp")}</p>
              {feePercent > 0 && draftLines.some((l) => l.code === "part") && (
                <p className="text-xs text-accent-strong">
                  {t("feeSuggestion", { percent: feePercent, amount: formatMoney(Math.round(draftLines.filter((l) => l.code === "part")
                    .reduce((s, l) => s + Number(l.amount), 0) * feePercent) / 100, draft.currency, locale) })}
                </p>
              )}
              <ol className="flex flex-col gap-3">
                {Array.from({ length: rows }, (_, i) => {
                  const l = draftLines[i];
                  return (
                    <li key={l?.id ?? `new-${i}`} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-6">
                      <Select name={`line_code_${i}`} aria-label={t("lineCode")} defaultValue={l?.code ?? (i === 0 ? "part" : "other")} className="sm:col-span-2">
                        {costLineCodes.map((c) => <option key={c} value={c}>{tl(c)}</option>)}
                      </Select>
                      <Input name={`line_desc_${i}`} placeholder={t("lineDescription")} aria-label={t("lineDescription")} defaultValue={l?.description ?? ""} maxLength={300} className="sm:col-span-4" />
                      <Input name={`line_qty_${i}`} type="number" min={1} max={999} aria-label={tq("qty")} placeholder={tq("qty")} defaultValue={l?.quantity ?? 1} />
                      <Input name={`line_amount_${i}`} inputMode="decimal" dir="ltr" pattern="[0-9]{1,9}(\.[0-9]{1,2})?" aria-label={t("unitAmount")} placeholder={t("unitAmount")}
                        defaultValue={l ? String(Math.abs(Number(l.unit_amount))) : ""} />
                      <Select name={`line_status_${i}`} aria-label={t("lineStatus")} defaultValue={l?.status ?? "confirmed"}>
                        {lineStatuses.map((s) => <option key={s} value={s}>{tq(`lineStatus_${s}`)}</option>)}
                      </Select>
                      <Input name={`line_source_${i}`} placeholder={t("lineSource")} aria-label={t("lineSource")} defaultValue={l?.source ?? ""} maxLength={200} />
                      <Input name={`line_beneficiary_${i}`} placeholder={t("lineBeneficiary")} aria-label={t("lineBeneficiary")} defaultValue={l?.beneficiary ?? ""} maxLength={200} className="sm:col-span-2" />
                    </li>
                  );
                })}
              </ol>
              <div><SubmitButton variant="secondary">{t("saveLines")}</SubmitButton></div>
            </form>

            {draftLines.length > 0 && (
              <>
                <QuoteBreakdown lines={draftLines} currency={draft.currency} total={linesTotal(draftLines)} locale={locale} showInternal />
                <form action={issueCustomerQuote} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  {hidden}
                  <input type="hidden" name="quoteId" value={draft.id} />
                  <Field label={tq("validUntil")} htmlFor="validUntil">
                    <Input id="validUntil" name="validUntil" type="date" required dir="ltr" />
                  </Field>
                  <Field label={tq("deliveryDays")} htmlFor="deliveryDays">
                    <Input id="deliveryDays" name="deliveryDays" type="number" min={1} max={365} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={tq("sellerOfRecord")} hint={t("sellerHint")} htmlFor="sellerOfRecord">
                      <Input id="sellerOfRecord" name="sellerOfRecord" required maxLength={200} defaultValue={draft.seller_of_record ?? ""} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={tq("cancellationTerms")} htmlFor="cancellationTerms">
                      <Textarea id="cancellationTerms" name="cancellationTerms" required maxLength={2000} defaultValue={draft.cancellation_terms ?? ""} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={tq("notes")} htmlFor="notes">
                      <Textarea id="notes" name="notes" maxLength={2000} defaultValue={draft.notes ?? ""} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2"><SubmitButton>{t("issue")}</SubmitButton></div>
                </form>
              </>
            )}
          </>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{tq("history")}</h2>
          {history.map((h) => (
            <details key={h.id} className="rounded-lg border border-line p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                {tq("quoteVersion", { version: h.version })} <Badge tone={statusTone(h.status)}>{tcq(h.status)}</Badge>
                {h.total && <span className="font-bold ltr-value">{formatMoney(h.total, h.currency, locale)}</span>}
                {h.issued_at && <span className="text-xs text-muted">{dateFmt.format(new Date(h.issued_at))}</span>}
              </summary>
              <div className="mt-2"><QuoteBreakdown lines={h.ap_customer_quote_lines} currency={h.currency} total={h.total} locale={locale} showInternal /></div>
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
