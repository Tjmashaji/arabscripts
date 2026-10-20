import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Input, PageTitle, Select, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCarrierOrganizations } from "@/lib/partner-data";
import { formatMoney } from "@/lib/catalog";
import { shippingModes } from "@/lib/shipping";
import { saveCarrierService } from "@/server/shipping-actions";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type Service = { id: string; organization_id: string; name: string; mode: string; origin_countries: string[]; destination_countries: string[];
  transit_days_min: number | null; transit_days_max: number | null; notes: string | null; enabled: boolean };
type QuoteRow = { id: string; request_reference: string; part_description: string; mode: string; origin_country: string; destination_city: string;
  price: string | null; currency: string | null; status: string; created_at: string; request_open: boolean };
type ShipmentRow = { id: string; reference: string; status: string; tracking_number: string | null; destination_city: string; created_at: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "carrier" }))("title") };
}

// لوحة وكيل الشحن: الخدمات ومناطق التغطية، طلبات عروض الشحن، والشحنات المسندة.
export default async function CarrierHome({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations("carrier");
  const tm = await getTranslations("shippingModes");
  const tsq = await getTranslations("shippingQuoteStatus");
  const ts = await getTranslations("shipmentStatus");
  const tsh = await getTranslations("shipping");
  const orgs = await getCarrierOrganizations();
  const supabase = await createClient();
  const [{ data: services }, { data: quotes }, { data: shipments }] = orgs.length
    ? await Promise.all([
        supabase.from("ap_carrier_services").select("*").in("organization_id", orgs.map((o) => o.id)).order("created_at"),
        supabase.rpc("ap_carrier_shipping_quotes", {}),
        supabase.from("ap_shipments").select("id, reference, status, tracking_number, destination_city, created_at")
          .in("carrier_id", orgs.map((o) => o.id)).order("created_at", { ascending: false }).limit(100),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  const serviceForm = (s?: Service) => (
    <form action={saveCarrierService} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      {s && <input type="hidden" name="serviceId" value={s.id} />}
      {orgs.length === 1 || s ? (
        <input type="hidden" name="organizationId" value={s?.organization_id ?? orgs[0].id} />
      ) : (
        <Select name="organizationId" aria-label={t("organization")} className="sm:col-span-2">
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      )}
      <Input name="name" required minLength={2} maxLength={120} placeholder={t("serviceName")} aria-label={t("serviceName")} defaultValue={s?.name ?? ""} />
      <Select name="mode" aria-label={tsh("mode")} defaultValue={s?.mode ?? "air"}>{shippingModes.map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select>
      <Input name="origins" required dir="ltr" placeholder={t("origins")} aria-label={t("origins")} defaultValue={s?.origin_countries.join(", ") ?? "CN"} />
      <Input name="destinations" required dir="ltr" placeholder={t("destinations")} aria-label={t("destinations")} defaultValue={s?.destination_countries.join(", ") ?? "SA"} />
      <Input name="daysMin" type="number" min={0} max={365} placeholder={t("daysMin")} aria-label={t("daysMin")} defaultValue={s?.transit_days_min ?? ""} />
      <Input name="daysMax" type="number" min={0} max={365} placeholder={t("daysMax")} aria-label={t("daysMax")} defaultValue={s?.transit_days_max ?? ""} />
      <Input name="notes" maxLength={1000} placeholder={tsh("note")} aria-label={tsh("note")} defaultValue={s?.notes ?? ""} className="sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} className="size-4 accent-accent" /> {t("enabled")}
      </label>
      <div><SubmitButton variant="secondary">{tsh("save")}</SubmitButton></div>
    </form>
  );

  return (
    <SiteShell locale={locale} path="/carrier">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-10">
        <PageTitle>{t("title")}</PageTitle>
        {q.saved && <Alert tone="success">{tsh("saved")}</Alert>}
        {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}
        {orgs.length === 0 ? (
          <Alert tone="info">{t("notCarrier")}</Alert>
        ) : (
          <>
            <Card className="flex flex-col gap-3">
              <h2 className="font-bold">{t("quoteRequests")}</h2>
              {(quotes ?? []).length === 0 ? <p className="text-sm text-muted">{t("noQuoteRequests")}</p> : (
                <ul className="flex flex-col gap-2">
                  {((quotes ?? []) as QuoteRow[]).map((r) => (
                    <li key={r.id}>
                      <Link href={`/carrier/quotes/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 hover:border-accent">
                        <div className="min-w-0">
                          <p className="font-bold"><span className="ltr-value">{r.request_reference}</span> · {tm(r.mode)}</p>
                          <p className="truncate text-xs text-muted"><span className="ltr-value">{r.origin_country}</span> → {r.destination_city} · {r.part_description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.price && r.currency && <span className="font-bold ltr-value">{formatMoney(r.price, r.currency, locale)}</span>}
                          <Badge tone={r.status === "requested" ? "info" : statusTone(r.status)}>{tsq(r.status)}</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="font-bold">{t("shipments")}</h2>
              {(shipments ?? []).length === 0 ? <p className="text-sm text-muted">{tsh("noShipments")}</p> : (
                <ul className="flex flex-col gap-2">
                  {((shipments ?? []) as ShipmentRow[]).map((s) => (
                    <li key={s.id}>
                      <Link href={`/carrier/shipments/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 hover:border-accent">
                        <div>
                          <p className="font-bold ltr-value">{s.reference}</p>
                          <p className="text-xs text-muted">{s.destination_city} · <span className="ltr-value">{s.tracking_number ?? "—"}</span> · {dateFmt.format(new Date(s.created_at))}</p>
                        </div>
                        <Badge tone={s.status === "delivered" ? "success" : "info"}>{ts(s.status)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card id="services" className="flex flex-col gap-3">
              <h2 className="font-bold">{t("services")}</h2>
              <p className="text-xs text-muted">{t("servicesHelp")}</p>
              {((services ?? []) as Service[]).map((s) => (
                <details key={s.id} className="rounded-lg border border-line p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-bold">{s.name}</span> · {tm(s.mode)} · <span className="ltr-value">{s.origin_countries.join(",")} → {s.destination_countries.join(",")}</span>
                    {!s.enabled && <> · <Badge tone="neutral">{t("disabled")}</Badge></>}
                  </summary>
                  <div className="mt-3">{serviceForm(s)}</div>
                </details>
              ))}
              <details className="rounded-lg border border-dashed border-line p-3">
                <summary className="cursor-pointer text-sm font-bold">{t("addService")}</summary>
                <div className="mt-3">{serviceForm()}</div>
              </details>
            </Card>
          </>
        )}
      </div>
    </SiteShell>
  );
}
