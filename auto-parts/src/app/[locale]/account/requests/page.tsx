import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "quotes" }))("myRequests") };
}

export default async function MyRequests({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireSession(locale, "/account/requests");
  const t = await getTranslations("quotes");
  const ts = await getTranslations("requestStatus");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_quote_requests")
    .select("id, reference, description, part_number, quantity, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <SiteShell locale={locale} path="/account/requests">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle>{t("myRequests")}</PageTitle>
          <div className="flex gap-2">
            <Link href="/account/orders" className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold">{t("myOrders")}</Link>
            <Link href="/request-part" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">{t("newRequest")}</Link>
          </div>
        </div>
        {rows.length === 0 ? (
          <Card><p className="text-muted">{t("noRequests")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/account/requests/${r.id}`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                    <div className="min-w-0">
                      <p className="font-bold ltr-value">{r.reference}</p>
                      <p className="truncate text-sm">{r.description}</p>
                      <p className="text-xs text-muted">
                        {dateFmt.format(new Date(r.created_at))}
                        {r.part_number && <> · <span className="ltr-value">{r.part_number}</span></>} · × {r.quantity}
                      </p>
                    </div>
                    <Badge tone={statusTone(r.status)}>{ts(r.status)}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
