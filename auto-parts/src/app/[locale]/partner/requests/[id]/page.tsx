import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { currencies, formatMoney, localName, partTypes } from "@/lib/catalog";
import { countries } from "@/lib/partners";
import { submitSupplierQuote, withdrawSupplierQuote } from "@/server/quote-actions";
import { localeFrom } from "@/i18n/locales";

type Row = {
  id: string; reference: string; organization_id: string; status: string; brand_id: string | null; model_id: string | null;
  vehicle_year: number | null; engine: string | null; vin: string | null; part_number: string | null; description: string;
  quantity: number; city: string; invited_at: string; media_count: number; my_quote_id: string | null; my_quote_status: string | null;
};
type MyQuote = {
  id: string; part_type: string; unit_price: string; currency: string; quantity_available: number | null; lead_time_days: number | null;
  origin_country: string | null; valid_until: string; compatibility_notes: string | null; status: string;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "supplierRequests" }))("title") };
}

export default async function SupplierRequest({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("supplierRequests");
  const tq = await getTranslations("quotes");
  const tc = await getTranslations("catalog");
  const tp = await getTranslations("partTypes");
  const ts = await getTranslations("requestStatus");
  const tsq = await getTranslations("supplierQuoteStatus");
  const tpp = await getTranslations("partnerProducts");
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_supplier_requests", { p_request: id });
  const row = ((data ?? []) as Row[])[0];
  if (!row) notFound();
  const { data: quoteRow } = row.my_quote_id
    ? await supabase.from("ap_supplier_quotes").select("*").eq("id", row.my_quote_id).maybeSingle()
    : { data: null };
  const mine = quoteRow as MyQuote | null;
  const { data: mediaRows } = row.media_count > 0 ? await supabase.rpc("ap_supplier_request_media", { p_request: id }) : { data: [] };
  const media = (mediaRows ?? []) as { id: string }[];
  const { brands, models } = await getCatalog();
  const brand = brands.find((b) => b.id === row.brand_id);
  const model = models.find((m) => m.id === row.model_id);
  const open = ["reviewing", "sourcing", "quoted"].includes(row.status);
  const editable = open && (!mine || ["submitted", "withdrawn"].includes(mine.status));
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={row.id} />
    </>
  );

  return (
    <SiteShell locale={locale} path={`/partner/requests/${id}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <Link href="/partner/requests" className="text-sm text-accent">← {t("title")}</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle><span className="ltr-value">{row.reference}</span></PageTitle>
          <Badge tone={statusTone(row.status)}>{ts(row.status)}</Badge>
        </div>
        {q.saved && <Alert tone="success">{tpp("saved")}</Alert>}
        {q.error && <Alert tone="danger">{tpp("failed")}{q.error}</Alert>}

        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-muted">{tq("description")}</dt><dd className="whitespace-pre-line">{row.description}</dd></div>
            <div><dt className="text-xs text-muted">{tc("brand")} / {tc("model")}</dt><dd>{[brand && localName(brand, locale), model && modelLabel(model, locale)].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("year")} / {tc("engine")}</dt><dd className="ltr-value">{[row.vehicle_year, row.engine].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tq("vin")}</dt><dd className="ltr-value">{row.vin ?? t("vinHidden")}</dd></div>
            <div><dt className="text-xs text-muted">{tq("partNumber")}</dt><dd className="ltr-value">{row.part_number ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("quantity")}</dt><dd>{row.quantity}</dd></div>
            <div><dt className="text-xs text-muted">{tq("city")}</dt><dd>{row.city}</dd></div>
          </dl>
          {media.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={m.id}>
                  <a href={`/api/request-media/${m.id}?request=${row.id}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1 text-sm text-accent">
                    {tq("photo")} {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">{t("privacyNote")}</p>
        </Card>

        {mine && (
          <Card className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">{t("myQuote")}</h2>
              <Badge tone={statusTone(mine.status)}>{tsq(mine.status)}</Badge>
            </div>
            <p className="text-lg font-bold ltr-value">{formatMoney(mine.unit_price, mine.currency, locale)} · {tp(mine.part_type)}</p>
            <p className="text-xs text-muted">{tc("validUntil", { date: dateFmt.format(new Date(mine.valid_until)) })}</p>
            {mine.status === "submitted" && (
              <form action={withdrawSupplierQuote}>
                {hidden}
                <input type="hidden" name="quoteId" value={mine.id} />
                <SubmitButton variant="danger">{t("withdraw")}</SubmitButton>
              </form>
            )}
          </Card>
        )}

        {editable ? (
          <Card>
            <h2 className="mb-3 font-bold">{mine ? t("updateQuote") : t("submitQuote")}</h2>
            <form action={submitSupplierQuote} className="grid gap-4 sm:grid-cols-2">
              {hidden}
              <input type="hidden" name="organizationId" value={row.organization_id} />
              <Field label={tc("partType")} htmlFor="partType">
                <Select id="partType" name="partType" defaultValue={mine?.part_type ?? "genuine"}>
                  {partTypes.map((p) => <option key={p} value={p}>{tp(p)}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Field label={tpp("unitPrice")} htmlFor="unitPrice">
                  <Input id="unitPrice" name="unitPrice" inputMode="decimal" required pattern="[0-9]{1,9}(\.[0-9]{1,2})?" dir="ltr" defaultValue={mine?.unit_price ?? ""} />
                </Field>
                <Field label={tpp("currency")} htmlFor="currency">
                  <Select id="currency" name="currency" defaultValue={mine?.currency ?? "SAR"}>
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label={t("quantityAvailable")} htmlFor="quantityAvailable">
                <Input id="quantityAvailable" name="quantityAvailable" type="number" min={0} defaultValue={mine?.quantity_available ?? ""} />
              </Field>
              <Field label={tpp("leadTimeDays")} htmlFor="leadTimeDays">
                <Input id="leadTimeDays" name="leadTimeDays" type="number" min={0} max={365} defaultValue={mine?.lead_time_days ?? ""} />
              </Field>
              <Field label={tpp("originCountry")} htmlFor="originCountry">
                <Select id="originCountry" name="originCountry" defaultValue={mine?.origin_country ?? "CN"}>
                  {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label={tpp("validUntil")} htmlFor="validUntil">
                <Input id="validUntil" name="validUntil" type="date" required dir="ltr" defaultValue={mine?.valid_until?.slice(0, 10) ?? ""} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("compatibility")} htmlFor="notes">
                  <Textarea id="notes" name="notes" maxLength={2000} defaultValue={mine?.compatibility_notes ?? ""} />
                </Field>
              </div>
              <div className="sm:col-span-2"><SubmitButton>{mine ? t("updateQuote") : t("submitQuote")}</SubmitButton></div>
            </form>
          </Card>
        ) : (
          !open && <Alert tone="info">{t("closed")}</Alert>
        )}
      </div>
    </SiteShell>
  );
}
