import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { QuoteBreakdown, type QuoteLineRow } from "@/components/quote-breakdown";
import { Alert, Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/locales";

type Order = {
  id: string; reference: string; status: string; payment_status: string; total: string; currency: string; created_at: string;
  request_id: string; ap_order_items: QuoteLineRow[];
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "quotes" }))("myOrders") };
}

// طلبات الشراء: تُنشأ عند الموافقة على التسعيرة، وتبقى بانتظار الدفع (الدفع غير مفعّل في المنصة بعد).
export default async function MyOrders({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ created?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/account/orders");
  const { created } = await searchParams;
  const t = await getTranslations("quotes");
  const to = await getTranslations("orderStatus");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_orders")
    .select("id, reference, status, payment_status, total, currency, created_at, request_id, ap_order_items(id, code, description, quantity, unit_amount, amount, status, sort_order)")
    .eq("customer_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as Order[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

  return (
    <SiteShell locale={locale} path="/account/orders">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle>{t("myOrders")}</PageTitle>
          <Link href="/account/requests" className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold">{t("myRequests")}</Link>
        </div>
        {created && <Alert tone="success">{t("orderCreated")}</Alert>}
        <Alert tone="info">{t("paymentNotice")}</Alert>
        {orders.length === 0 ? (
          <Card><p className="text-muted">{t("noOrders")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold ltr-value">{o.reference}</p>
                      <p className="text-xs text-muted">{dateFmt.format(new Date(o.created_at))}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge tone={statusTone(o.status)}>{to(o.status)}</Badge>
                      <Badge tone="neutral">{t(`payment_${o.payment_status}`)}</Badge>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-accent">{t("breakdown")}</summary>
                    <div className="mt-2"><QuoteBreakdown lines={o.ap_order_items} currency={o.currency} total={o.total} locale={locale} /></div>
                  </details>
                  <Link href={`/account/requests/${o.request_id}`} className="text-sm text-accent">{t("viewRequest")}</Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
