import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { localePath, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/catalog";
import { orderStatuses } from "@/lib/quotes";
import { localeFrom } from "@/i18n/locales";

const filters = ["all", ...orderStatuses.filter((s) => s !== "draft")] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminOrders" }))("title") };
}

export default async function AdminOrders({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireStaff(locale, "/admin/orders");
  // العمليات تدير الطلبات، والمالية تسجّل دفعاتها.
  if (!session.permissions.has("orders.manage_all") && !session.permissions.has("finance.manage")) redirect(localePath(locale, "/forbidden"));
  const q = await searchParams;
  const status = (filters as readonly string[]).includes(q.status ?? "") ? q.status! : "all";
  const t = await getTranslations("adminOrders");
  const to = await getTranslations("orderStatus");
  const tq = await getTranslations("quotes");
  const supabase = await createClient();
  let query = supabase.from("ap_orders").select("id, reference, status, payment_status, total, currency, created_at").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;
  const rows = data ?? [];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("title")}</PageTitle>
      <nav className="flex flex-wrap gap-2">
        {filters.map((s) => (
          <Link key={s} href={{ pathname: "/admin/orders", query: { status: s } }}
            className={s === status ? "rounded-full bg-ink px-3 py-1 text-sm text-white" : "rounded-full border border-line px-3 py-1 text-sm"}>
            {s === "all" ? t("all") : to(s)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card><p className="text-sm text-muted">{t("none")}</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                  <div>
                    <p className="font-bold ltr-value">{o.reference}</p>
                    <p className="text-xs text-muted">{dateFmt.format(new Date(o.created_at))}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold ltr-value">{formatMoney(o.total, o.currency, locale)}</span>
                    <Badge tone={statusTone(o.status)}>{to(o.status)}</Badge>
                    <Badge tone={o.payment_status === "paid" ? "success" : "neutral"}>{tq(`payment_${o.payment_status}`)}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
