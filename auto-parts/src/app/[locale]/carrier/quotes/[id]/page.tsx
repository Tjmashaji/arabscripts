import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { currencies, formatMoney } from "@/lib/catalog";
import { chargeableWeight } from "@/lib/shipping";
import { submitShippingQuote, withdrawShippingQuote } from "@/server/shipping-actions";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type Row = {
  id: string; request_reference: string; part_description: string; mode: string; origin_country: string; origin_city: string | null;
  destination_country: string; destination_city: string; pieces: number; weight_kg: string; volumetric_weight_kg: string | null;
  length_cm: string | null; width_cm: string | null; height_cm: string | null; price: string | null; currency: string | null;
  delivery_estimate_days: number | null; valid_until: string | null; provider_quote_reference: string | null; status: string;
  notes: string | null; request_open: boolean;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "carrier" }))("quoteRequests") };
}

// طلب عرض شحن للناقل: بيانات الطرد والمسار فقط (لا بيانات العميل ولا المورد ولا سعر القطعة).
export default async function CarrierQuote({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("carrier");
  const tsh = await getTranslations("shipping");
  const tm = await getTranslations("shippingModes");
  const tsq = await getTranslations("shippingQuoteStatus");
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_carrier_shipping_quotes", { p_quote: id });
  const r = ((data ?? []) as Row[])[0];
  if (!r) notFound();
  const editable = r.request_open && ["requested", "submitted", "withdrawn"].includes(r.status);
  const dims = [r.length_cm, r.width_cm, r.height_cm].every(Boolean) ? `${r.length_cm} × ${r.width_cm} × ${r.height_cm} cm` : "—";
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="shippingQuoteId" value={r.id} />
    </>
  );

  return (
    <SiteShell locale={locale} path={`/carrier/quotes/${id}`}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <Link href="/carrier" className="text-sm text-accent">← {t("title")}</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle><span className="ltr-value">{r.request_reference}</span></PageTitle>
          <Badge tone={r.status === "requested" ? "info" : statusTone(r.status)}>{tsq(r.status)}</Badge>
        </div>
        {q.saved && <Alert tone="success">{tsh("saved")}</Alert>}
        {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("contents")}</dt><dd>{r.part_description}</dd></div>
            <div><dt className="text-xs text-muted">{tsh("mode")}</dt><dd>{tm(r.mode)}</dd></div>
            <div><dt className="text-xs text-muted">{t("route")}</dt><dd><span className="ltr-value">{r.origin_country}</span>{r.origin_city && ` ${r.origin_city}`} → <span className="ltr-value">{r.destination_country}</span> {r.destination_city}</dd></div>
            <div><dt className="text-xs text-muted">{tsh("weight")}</dt><dd>{tsh("kg", { value: Number(r.weight_kg) })}{r.volumetric_weight_kg && <> · {tsh("volumetricKg")}: {r.volumetric_weight_kg}</>} → {tsh("chargeable")}: {chargeableWeight(r.weight_kg, r.volumetric_weight_kg)}</dd></div>
            <div><dt className="text-xs text-muted">{t("dimensions")}</dt><dd className="ltr-value">{dims} · {tsh("pieces", { count: r.pieces })}</dd></div>
            {r.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">{tsh("note")}</dt><dd>{r.notes}</dd></div>}
          </dl>
          <p className="mt-3 text-xs text-muted">{t("privacyNote")}</p>
        </Card>
        {r.price && r.currency && (
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold ltr-value">{formatMoney(r.price, r.currency, locale)}{r.delivery_estimate_days != null && ` · ${r.delivery_estimate_days}d`}</p>
            {r.status === "submitted" && (
              <form action={withdrawShippingQuote}>{hidden}<SubmitButton variant="danger">{t("withdraw")}</SubmitButton></form>
            )}
          </Card>
        )}
        {editable ? (
          <Card>
            <form action={submitShippingQuote} className="grid gap-3 sm:grid-cols-2">
              {hidden}
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Field label={tsh("price")} htmlFor="price"><Input id="price" name="price" required inputMode="decimal" dir="ltr" defaultValue={r.price ?? ""} /></Field>
                <Field label={tsh("currency")} htmlFor="currency">
                  <Select id="currency" name="currency" defaultValue={r.currency ?? "SAR"}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                </Field>
              </div>
              <Field label={tsh("etaDays")} htmlFor="days"><Input id="days" name="days" type="number" min={1} max={365} defaultValue={r.delivery_estimate_days ?? ""} /></Field>
              <Field label={t("validUntil")} htmlFor="validUntil"><Input id="validUntil" name="validUntil" type="date" required dir="ltr" defaultValue={r.valid_until?.slice(0, 10) ?? ""} /></Field>
              <Field label={tsh("reference")} htmlFor="reference"><Input id="reference" name="reference" dir="ltr" maxLength={120} defaultValue={r.provider_quote_reference ?? ""} /></Field>
              <div className="sm:col-span-2"><Field label={tsh("note")} htmlFor="notes"><Textarea id="notes" name="notes" maxLength={1000} /></Field></div>
              <div><SubmitButton>{r.price ? t("updateQuote") : t("submitQuote")}</SubmitButton></div>
            </form>
          </Card>
        ) : (
          <Alert tone="info">{t("closed")}</Alert>
        )}
      </div>
    </SiteShell>
  );
}
