import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requestStatuses } from "@/lib/quotes";
import { localeFrom } from "@/i18n/locales";

type Row = {
  id: string; reference: string; description: string; part_number: string | null; quantity: number; city: string; status: string;
  created_at: string; ap_quote_request_suppliers: { organization_id: string }[]; ap_supplier_quotes: { id: string }[];
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminQuotes" }))("title") };
}

export default async function AdminQuotes({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/quotes", "quotes.manage");
  const q = await searchParams;
  const status = (requestStatuses as readonly string[]).includes(q.status ?? "") ? q.status! : "submitted";
  const t = await getTranslations("adminQuotes");
  const ts = await getTranslations("requestStatus");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_quote_requests")
    .select("id, reference, description, part_number, quantity, city, status, created_at, ap_quote_request_suppliers(organization_id), ap_supplier_quotes(id)")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (data ?? []) as Row[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("title")}</PageTitle>
      <nav className="flex flex-wrap gap-2">
        {requestStatuses.map((s) => (
          <Link key={s} href={{ pathname: "/admin/quotes", query: { status: s } }}
            className={s === status ? "rounded-full bg-ink px-3 py-1 text-sm text-white" : "rounded-full border border-line px-3 py-1 text-sm"}>
            {ts(s)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card><p className="text-sm text-muted">{t("none")}</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/quotes/${r.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                  <div className="min-w-0">
                    <p className="font-bold ltr-value">{r.reference}</p>
                    <p className="truncate text-sm">{r.description}</p>
                    <p className="text-xs text-muted">
                      {dateFmt.format(new Date(r.created_at))} · {r.city} · × {r.quantity}
                      {r.part_number && <> · <span className="ltr-value">{r.part_number}</span></>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone="neutral">{t("suppliersCount", { count: r.ap_quote_request_suppliers.length })}</Badge>
                    <Badge tone={r.ap_supplier_quotes.length ? "info" : "neutral"}>{t("quotesCount", { count: r.ap_supplier_quotes.length })}</Badge>
                    <Badge tone={statusTone(r.status)}>{ts(r.status)}</Badge>
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
