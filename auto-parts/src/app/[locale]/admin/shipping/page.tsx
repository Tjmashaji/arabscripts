import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/catalog";
import { closedShipmentStatuses, type ShipmentStatus } from "@/lib/shipping";
import { localeFrom } from "@/i18n/locales";

type Shipment = {
  id: string; reference: string; order_id: string; status: ShipmentStatus; carrier_id: string | null; carrier_name: string | null;
  tracking_number: string | null; destination_city: string; estimated_delivery_at: string | null; created_at: string;
};
type ShippingQuote = {
  id: string; request_id: string; carrier_id: string | null; carrier_name: string | null; status: string; price: string | null;
  currency: string | null; valid_until: string | null; created_at: string;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "shipping" }))("adminTitle") };
}

async function loadNow() {
  return Date.now();
}

// متابعة الشحن: الشحنات النشطة (والمتأخرة أولًا) وعروض الشحن المنتظرة من الناقلين.
export default async function AdminShipping({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/shipping", "shipping.manage");
  const { view } = await searchParams;
  const t = await getTranslations("shipping");
  const ts = await getTranslations("shipmentStatus");
  const tsq = await getTranslations("shippingQuoteStatus");
  const supabase = await createClient();
  const [{ data: shipmentRows }, { data: quoteRows }, { data: orgRows }] = await Promise.all([
    supabase.from("ap_shipments").select("id, reference, order_id, status, carrier_id, carrier_name, tracking_number, destination_city, estimated_delivery_at, created_at")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("ap_shipping_quotes").select("id, request_id, carrier_id, carrier_name, status, price, currency, valid_until, created_at")
      .in("status", ["requested", "submitted"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("ap_organizations").select("id, legal_name, trade_name"),
  ]);
  const now = await loadNow();
  const orgName = new Map((orgRows ?? []).map((o) => [o.id as string, (o.trade_name || o.legal_name) as string]));
  const all = (shipmentRows ?? []) as Shipment[];
  const isLate = (s: Shipment) => !closedShipmentStatuses.includes(s.status) && !!s.estimated_delivery_at && new Date(s.estimated_delivery_at).getTime() < now;
  const shipments = (view === "all" ? all : all.filter((s) => !closedShipmentStatuses.includes(s.status)))
    .sort((a, b) => Number(isLate(b)) - Number(isLate(a)));
  const quotes = (quoteRows ?? []) as ShippingQuote[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("adminTitle")}</PageTitle>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("shipmentsTitle")}</h2>
          <nav className="flex gap-2 text-sm">
            <Link href="/admin/shipping" className={view !== "all" ? "rounded-full bg-ink px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1"}>{t("active")}</Link>
            <Link href={{ pathname: "/admin/shipping", query: { view: "all" } }} className={view === "all" ? "rounded-full bg-ink px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1"}>{t("all")}</Link>
          </nav>
        </div>
        {shipments.length === 0 ? (
          <Card><p className="text-sm text-muted">{t("noShipments")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {shipments.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/orders/${s.order_id}#shipment`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                    <div>
                      <p className="font-bold"><span className="ltr-value">{s.reference}</span> · {s.carrier_id ? orgName.get(s.carrier_id) : s.carrier_name}</p>
                      <p className="text-xs text-muted">
                        {s.destination_city} · <span className="ltr-value">{s.tracking_number ?? "—"}</span>
                        {s.estimated_delivery_at && <> · {t("eta")} {dateFmt.format(new Date(s.estimated_delivery_at))}</>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isLate(s) && <Badge tone="danger">{t("late")}</Badge>}
                      <Badge tone={s.status === "delivered" ? "success" : statusTone("opened")}>{ts(s.status)}</Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("pendingQuotes")}</h2>
        {quotes.length === 0 ? (
          <Card><p className="text-sm text-muted">{t("noQuotes")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/admin/quotes/${q.request_id}#shipping`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                    <div>
                      <p className="font-bold">{q.carrier_id ? orgName.get(q.carrier_id) : q.carrier_name}</p>
                      <p className="text-xs text-muted">{dateFmt.format(new Date(q.created_at))}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {q.price && q.currency && <span className="font-bold ltr-value">{formatMoney(q.price, q.currency, locale)}</span>}
                      <Badge tone={q.status === "submitted" ? "info" : "neutral"}>{tsq(q.status)}</Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
