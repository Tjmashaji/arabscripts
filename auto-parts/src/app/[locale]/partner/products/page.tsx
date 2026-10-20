import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Alert, Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getSellingOrganizations } from "@/lib/partner-data";
import { getCatalog } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partnerProducts" }))("title") };
}

export default async function PartnerProducts({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const t = await getTranslations("partnerProducts");
  const ts = await getTranslations("productStatus");
  const tc = await getTranslations("catalog");
  const orgs = await getSellingOrganizations();
  const { brands } = await getCatalog();
  const supabase = await createClient();
  const { data } = orgs.length
    ? await supabase
        .from("ap_products")
        .select("id, name, status, brand_id, review_reason, updated_at, ap_product_identifiers(value), ap_product_offers(id, status)")
        .in("organization_id", orgs.map((o) => o.id))
        .order("updated_at", { ascending: false })
    : { data: [] };
  const brandName = new Map(brands.map((b) => [b.id, localName(b, locale)]));

  return (
    <SiteShell locale={locale} path="/partner/products">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle>{t("title")}</PageTitle>
          {orgs.length > 0 && (
            <Link href="/partner/products/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">
              {t("new")}
            </Link>
          )}
        </div>
        {orgs.length === 0 && <Alert tone="info">{t("notAllowed")}</Alert>}
        {orgs.length > 0 && (data ?? []).length === 0 && <p className="text-muted">{t("none")}</p>}
        <ul className="flex flex-col gap-3">
          {(data ?? []).map((p) => (
            <li key={p.id as string}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/partner/products/${p.id}`} className="font-bold text-accent">{p.name as string}</Link>
                  <p className="text-xs text-muted">
                    {brandName.get(p.brand_id as string)} ·{" "}
                    <span className="ltr-value">{(p.ap_product_identifiers as { value: string }[]).map((i) => i.value).join(", ")}</span>
                  </p>
                  {p.review_reason && <p className="mt-1 text-sm">{t("reviewReason")}: {p.review_reason as string}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{tc("offers", { count: (p.ap_product_offers as unknown[]).length })}</span>
                  <Badge tone={statusTone(p.status === "published" ? "approved" : p.status === "pending_review" ? "under_review" : (p.status as string))}>
                    {ts(p.status as string)}
                  </Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
