import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { QuoteBreakdown, type QuoteLineRow } from "@/components/quote-breakdown";
import { Alert, Badge, Card, Input, PageTitle, statusTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { isExpired, openRequestStatuses, type RequestStatus } from "@/lib/quotes";
import { acceptCustomerQuote, cancelQuoteRequest, declineCustomerQuote } from "@/server/quote-actions";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type Quote = {
  id: string; version: number; status: string; currency: string; total: string | null; has_estimated: boolean; valid_until: string | null;
  estimated_delivery_days: number | null; cancellation_terms: string | null; seller_of_record: string | null; notes: string | null;
  issued_at: string | null; ap_customer_quote_lines: QuoteLineRow[];
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "quotes" }))("requestDetails") };
}

async function loadNow() {
  return Date.now();
}

export default async function MyRequest({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; done?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireSession(locale, `/account/requests/${id}`);
  const q = await searchParams;
  const t = await getTranslations("quotes");
  const ts = await getTranslations("requestStatus");
  const tq = await getTranslations("customerQuoteStatus");
  const tc = await getTranslations("catalog");
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("ap_quote_requests")
    .select("id, reference, brand_id, model_id, vehicle_year, engine, vin, part_number, description, quantity, city, contact_name, contact_phone, status, created_at, ap_quote_request_media(id)")
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();
  const { data: quoteRows } = await supabase
    .from("ap_customer_quotes")
    .select("id, version, status, currency, total, has_estimated, valid_until, estimated_delivery_days, cancellation_terms, seller_of_record, notes, issued_at, ap_customer_quote_lines(id, code, description, quantity, unit_amount, amount, status, sort_order)")
    .eq("request_id", id)
    .order("version", { ascending: false });
  const quotes = (quoteRows ?? []) as Quote[];
  const { data: order } = await supabase.from("ap_orders").select("id, reference").eq("request_id", id).maybeSingle();
  const { brands, models } = await getCatalog();
  const brand = brands.find((b) => b.id === req.brand_id);
  const model = models.find((m) => m.id === req.model_id);
  const now = await loadNow();
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const current = quotes.find((x) => x.status === "issued" || x.status === "accepted");
  const history = quotes.filter((x) => x !== current);
  const media = req.ap_quote_request_media as { id: string }[];
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={req.id} />
    </>
  );
  const knownErrors = ["agree", "upload"];

  return (
    <SiteShell locale={locale} path={`/account/requests/${id}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <Link href="/account/requests" className="text-sm text-accent">← {t("myRequests")}</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle><span className="ltr-value">{req.reference}</span></PageTitle>
          <Badge tone={statusTone(req.status)}>{ts(req.status)}</Badge>
        </div>
        {q.created && <Alert tone="success">{t("created")}</Alert>}
        {q.done && <Alert tone="success">{t("done")}</Alert>}
        {q.error && <Alert tone="danger">{knownErrors.includes(q.error) ? t(`error_${q.error}`) : await errorMessage(q.error)}</Alert>}
        {order && (
          <Alert tone="success">
            {t("orderCreated")} <Link href="/account/orders" className="font-bold underline ltr-value">{order.reference}</Link>
          </Alert>
        )}

        <Card>
          <h2 className="mb-3 font-bold">{t("requestDetails")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("description")}</dt><dd className="whitespace-pre-line">{req.description}</dd></div>
            <div><dt className="text-xs text-muted">{tc("brand")} / {tc("model")}</dt><dd>{[brand && localName(brand, locale), model && modelLabel(model, locale)].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("year")} / {tc("engine")}</dt><dd className="ltr-value">{[req.vehicle_year, req.engine].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt className="text-xs text-muted">{t("vin")}</dt><dd className="ltr-value">{req.vin ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">{t("partNumber")}</dt><dd className="ltr-value">{req.part_number ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">{tc("quantity")}</dt><dd>{req.quantity}</dd></div>
            <div><dt className="text-xs text-muted">{t("city")}</dt><dd>{req.city}</dd></div>
            <div><dt className="text-xs text-muted">{t("contactName")}</dt><dd>{req.contact_name} · <span className="ltr-value">{req.contact_phone}</span></dd></div>
          </dl>
          {media.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={m.id}>
                  <a href={`/api/request-media/${m.id}?request=${req.id}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1 text-sm text-accent">
                    {t("photo")} {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {current ? (
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t("quoteVersion", { version: current.version })}</h2>
              <Badge tone={statusTone(current.status)}>{tq(current.status)}</Badge>
            </div>
            <QuoteBreakdown lines={current.ap_customer_quote_lines} currency={current.currency} total={current.total} locale={locale} />
            {current.has_estimated && <Alert tone="info">{t("hasEstimated")}</Alert>}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">{t("validUntil")}</dt><dd>{current.valid_until ? dateFmt.format(new Date(current.valid_until)) : "—"}</dd></div>
              <div><dt className="text-xs text-muted">{t("deliveryDays")}</dt><dd>{current.estimated_delivery_days != null ? tc("days", { count: current.estimated_delivery_days }) : "—"}</dd></div>
              <div><dt className="text-xs text-muted">{t("sellerOfRecord")}</dt><dd>{current.seller_of_record ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("cancellationTerms")}</dt><dd className="whitespace-pre-line">{current.cancellation_terms ?? "—"}</dd></div>
              {current.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("notes")}</dt><dd className="whitespace-pre-line">{current.notes}</dd></div>}
            </dl>
            {current.status === "issued" && (isExpired(current.valid_until, now) ? (
              <Alert tone="danger">{t("quoteExpired")}</Alert>
            ) : (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <Alert tone="info">{t("paymentNotice")}</Alert>
                <form action={acceptCustomerQuote} className="flex flex-col gap-3">
                  {hidden}
                  <input type="hidden" name="quoteId" value={current.id} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="agree" required className="mt-1 size-4 accent-accent" />
                    <span>{t("agreeText")}</span>
                  </label>
                  <div><SubmitButton>{t("accept")}</SubmitButton></div>
                </form>
                <form action={declineCustomerQuote} className="flex flex-col gap-2 sm:flex-row">
                  {hidden}
                  <input type="hidden" name="quoteId" value={current.id} />
                  <Input name="reason" placeholder={t("declineReason")} aria-label={t("declineReason")} maxLength={1000} />
                  <SubmitButton variant="danger">{t("decline")}</SubmitButton>
                </form>
              </div>
            ))}
          </Card>
        ) : (
          (openRequestStatuses as readonly string[]).includes(req.status) && <Alert tone="info">{t("waitingQuote")}</Alert>
        )}

        {history.length > 0 && (
          <Card>
            <h2 className="mb-2 font-bold">{t("history")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  {t("quoteVersion", { version: h.version })} <Badge tone={statusTone(h.status)}>{tq(h.status)}</Badge>
                  {h.issued_at && <span className="text-xs text-muted">{dateFmt.format(new Date(h.issued_at))}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(openRequestStatuses as readonly RequestStatus[]).includes(req.status as RequestStatus) && (
          <form action={cancelQuoteRequest}>
            {hidden}
            <SubmitButton variant="danger">{t("cancelRequest")}</SubmitButton>
          </form>
        )}
      </div>
    </SiteShell>
  );
}
