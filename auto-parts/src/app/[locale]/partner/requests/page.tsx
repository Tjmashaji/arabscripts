import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/locales";

type Row = {
  id: string; reference: string; status: string; description: string; part_number: string | null; quantity: number; city: string;
  invited_at: string; my_quote_status: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "supplierRequests" }))("title") };
}

// طلبات التسعير المرسلة لمنشآت المستخدم فقط (ap_supplier_requests)، بلا بيانات اتصال العميل.
export default async function SupplierRequests({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const t = await getTranslations("supplierRequests");
  const ts = await getTranslations("requestStatus");
  const tsq = await getTranslations("supplierQuoteStatus");
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_supplier_requests", {});
  const rows = (data ?? []) as Row[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <SiteShell locale={locale} path="/partner/requests">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <Link href="/partner" className="text-sm text-accent">← {(await getTranslations("partner"))("portal")}</Link>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm text-muted">{t("help")}</p>
        {rows.length === 0 ? (
          <Card><p className="text-muted">{t("none")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={`${r.id}:${r.reference}`}>
                <Link href={`/partner/requests/${r.id}`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                    <div className="min-w-0">
                      <p className="font-bold ltr-value">{r.reference}</p>
                      <p className="truncate text-sm">{r.description}</p>
                      <p className="text-xs text-muted">
                        {dateFmt.format(new Date(r.invited_at))} · {r.city} · × {r.quantity}
                        {r.part_number && <> · <span className="ltr-value">{r.part_number}</span></>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={statusTone(r.status)}>{ts(r.status)}</Badge>
                      <Badge tone={r.my_quote_status ? statusTone(r.my_quote_status) : "neutral"}>
                        {r.my_quote_status ? tsq(r.my_quote_status) : t("noQuoteYet")}
                      </Badge>
                    </div>
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
