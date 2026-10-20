import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { PartSearchForm } from "@/components/part-search-form";
import { ProductGrid, type ProductRow } from "@/components/product-grid";
import { Card, PageTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { alternates } from "@/lib/seo";
import { localeFrom } from "@/i18n/locales";

async function findBrand(slug: string) {
  const { brands, models } = await getCatalog();
  const brand = brands.find((b) => b.slug === slug);
  return brand ? { brand, models: models.filter((m) => m.brand_id === brand.id && m.enabled) } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  const { slug } = await params;
  const found = await findBrand(slug);
  if (!found) return {};
  const t = await getTranslations({ locale, namespace: "brandPage" });
  const name = localName(found.brand, locale);
  return { title: t("title", { brand: name }), description: t("description", { brand: name }), alternates: alternates(locale, `/brands/${slug}`) };
}

// صفحة لكل علامة (للبحث في Google): موديلاتها المضافة وأحدث قطعها المنشورة، وروابط للبحث المفصّل وطلب قطعة.
export default async function BrandPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { slug } = await params;
  const found = await findBrand(slug);
  if (!found) notFound();
  const { brand, models } = found;
  const t = await getTranslations("brandPage");
  const name = localName(brand, locale);
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_search_products", { p_brand: brand.id, p_limit: 24, p_offset: 0 });
  const rows = (data ?? []) as ProductRow[];
  const total = rows[0]?.total_count ?? 0;

  return (
    <SiteShell locale={locale} path={`/brands/${slug}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2">
          <PageTitle>{t("title", { brand: name })}</PageTitle>
          <p className="max-w-3xl text-muted">{t("intro", { brand: name })}</p>
        </header>
        <PartSearchForm locale={locale} action={locale === "ar" ? "/products" : `/${locale}/products`} values={{ brand: brand.id }} />
        {models.length > 0 && (
          <section aria-labelledby="models" className="flex flex-col gap-3">
            <h2 id="models" className="text-xl font-bold">{t("models", { brand: name })}</h2>
            <ul className="flex flex-wrap gap-2">
              {models.map((m) => (
                <li key={m.id}>
                  <Link href={{ pathname: "/products", query: { brand: brand.id, model: m.id } }} className="block rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-accent">
                    {modelLabel(m, locale)}{m.year_from && <span className="ltr-value ms-1 text-xs text-muted">{m.year_from}–{m.year_to ?? ""}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="parts" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="parts" className="text-xl font-bold">{t("parts", { brand: name })}</h2>
            {total > rows.length && <Link href={{ pathname: "/products", query: { brand: brand.id } }} className="text-sm font-bold text-accent">{t("all", { count: total })}</Link>}
          </div>
          {rows.length > 0 ? <ProductGrid rows={rows} locale={locale} /> : (
            <Card className="flex flex-col items-start gap-3">
              <p>{t("none", { brand: name })}</p>
              <Link href="/request-part" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">{t("request")}</Link>
            </Card>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
