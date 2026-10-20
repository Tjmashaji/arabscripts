import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, Button, Card, Input, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/catalog";
import { localeFrom } from "@/i18n/locales";

type Summary = {
  requests: number; quoted_requests: number; accepted_requests: number; avg_hours_to_quote: number | null;
  requests_by_status: Record<string, number>; orders: number; paid_orders: number; orders_by_status: Record<string, number>;
  money: { currency: string; gmv: number; service_fee: number; discounts: number; net_service_income: number }[];
  shipments_active: number; shipments_late: number; shipments_delivered: number;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "reports" }))("title") };
}

const isoDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

async function defaultRange() {
  const now = new Date();
  return { from: isoDate(new Date(now.getTime() - 29 * 86_400_000)), to: isoDate(now) };
}

// تقارير تشغيلية أساسية. قيمة الطلبات منفصلة عن رسوم الخدمة وصافيها؛ كل عملة وحدها.
export default async function Reports({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/reports", "reports.read");
  const q = await searchParams;
  const range = await defaultRange();
  const valid = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = valid(q.from) ? q.from! : range.from;
  const to = valid(q.to) ? q.to! : range.to;
  const t = await getTranslations("reports");
  const tr = await getTranslations("requestStatus");
  const to_ = await getTranslations("orderStatus");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_report_summary", { p_from: from, p_to: to });
  const s = data as Summary | null;
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : locale);
  const pct = (a: number, b: number) => (b > 0 ? `${fmt.format(Math.round((a / b) * 100))}%` : "—");

  const tiles = s ? [
    { label: t("requests"), value: fmt.format(s.requests) },
    { label: t("quotedRate"), value: pct(s.quoted_requests, s.requests) },
    { label: t("acceptedRate"), value: pct(s.accepted_requests, s.requests) },
    { label: t("avgHours"), value: s.avg_hours_to_quote != null ? fmt.format(s.avg_hours_to_quote) : "—" },
    { label: t("orders"), value: fmt.format(s.orders) },
    { label: t("paidOrders"), value: fmt.format(s.paid_orders) },
    { label: t("activeShipments"), value: fmt.format(s.shipments_active) },
    { label: t("lateShipments"), value: fmt.format(s.shipments_late) },
  ] : [];

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("title")}</PageTitle>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">{t("from")}<Input type="date" name="from" defaultValue={from} dir="ltr" /></label>
        <label className="flex flex-col gap-1 text-sm">{t("to")}<Input type="date" name="to" defaultValue={to} dir="ltr" /></label>
        <Button type="submit" variant="secondary">{t("apply")}</Button>
        <a href={`/api/reports/orders?from=${from}&to=${to}`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-bold text-white">
          {t("exportCsv")}
        </a>
      </form>
      {error && <Alert tone="danger">{t("failed")}</Alert>}
      {s && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile) => (
              <Card key={tile.label}>
                <p className="text-sm text-muted">{tile.label}</p>
                <p className="mt-2 text-3xl font-bold">{tile.value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <h2 className="mb-3 font-bold">{t("moneyTitle")}</h2>
            {s.money.length === 0 ? (
              <p className="text-sm text-muted">{t("noMoney")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-2 text-start font-normal">{t("currency")}</th>
                      <th className="py-2 text-end font-normal">{t("gmv")}</th>
                      <th className="py-2 text-end font-normal">{t("serviceFee")}</th>
                      <th className="py-2 text-end font-normal">{t("discounts")}</th>
                      <th className="py-2 text-end font-normal">{t("netService")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.money.map((m) => (
                      <tr key={m.currency} className="border-b border-line/60">
                        <td className="py-2 ltr-value">{m.currency}</td>
                        <td className="py-2 text-end ltr-value">{formatMoney(m.gmv, m.currency, locale)}</td>
                        <td className="py-2 text-end ltr-value">{formatMoney(m.service_fee, m.currency, locale)}</td>
                        <td className="py-2 text-end ltr-value">{formatMoney(m.discounts, m.currency, locale)}</td>
                        <td className="py-2 text-end font-bold ltr-value">{formatMoney(m.net_service_income, m.currency, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{t("moneyNote")}</p>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-bold">{t("requestsByStatus")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(s.requests_by_status).map(([k, v]) => <li key={k} className="flex justify-between"><span>{tr(k)}</span><span>{fmt.format(v)}</span></li>)}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-2 font-bold">{t("ordersByStatus")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(s.orders_by_status).map(([k, v]) => <li key={k} className="flex justify-between"><span>{to_(k)}</span><span>{fmt.format(v)}</span></li>)}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
