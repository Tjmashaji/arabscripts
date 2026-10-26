import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { PartSearchForm } from "@/components/part-search-form";
import { ProductGrid, type ProductRow } from "@/components/product-grid";
import { Card, PageTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/catalog-data";
import { PAGE_SIZE, isPartType, localName, partTypes } from "@/lib/catalog";
import { alternates } from "@/lib/seo";
import { localeFrom } from "@/i18n/locales";

type Search = { q?: string; brand?: string; model?: string; year?: string; category?: string; type?: string; available?: string; min?: string; max?: string; page?: string };

const uuidOrNull = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const numOrNull = (v?: string) => (v && /^\d{1,7}(\.\d{1,2})?$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "catalog" }))("title"), alternates: alternates(locale, "/products") };
}

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations("catalog");
  const tp = await getTranslations("partTypes");
  const { categories } = await getCatalog();
  const page = Math.max(1, Math.min(100, Number(q.page) || 1));
  const year = q.year && /^\d{4}$/.test(q.year) ? Number(q.year) : null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_search_products", {
    p_query: q.q?.slice(0, 100) || null, p_brand: uuidOrNull(q.brand), p_model: uuidOrNull(q.model), p_year: year,
    p_category: uuidOrNull(q.category), p_part_type: isPartType(q.type) ? q.type : null, p_available_only: q.available === "1",
    p_price_min: numOrNull(q.min), p_price_max: numOrNull(q.max), p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = (data ?? []) as ProductRow[];
  const total = rows[0]?.total_count ?? 0;
  const pageLink = (p: number) => ({ pathname: "/products" as const, query: { ...q, page: String(p) } });

  return (
    <SiteShell locale={locale} path="/products">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
        <PageTitle>{t("title")}</PageTitle>
        <PartSearchForm
          locale={locale}
          action={locale === "ar" ? "/products" : `/${locale}/products`}
          values={q}
          filtersOpen={Boolean(q.category || q.type || q.min || q.max || q.available)}
          filters={
            <>
              <select name="category" defaultValue={q.category ?? ""} aria-label={t("category")} className="min-h-11 rounded-lg border border-line bg-card px-2">
                <option value="">{t("category")}: {t("any")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {localName(c, locale)}
                  </option>
                ))}
              </select>
              <select name="type" defaultValue={q.type ?? ""} aria-label={t("partType")} className="min-h-11 rounded-lg border border-line bg-card px-2">
                <option value="">{t("partType")}: {t("any")}</option>
                {partTypes.map((p) => (
                  <option key={p} value={p}>
                    {tp(p)}
                  </option>
                ))}
              </select>
              <input name="min" defaultValue={q.min} placeholder={t("priceMin")} aria-label={t("priceMin")} inputMode="decimal" dir="ltr" className="min-h-11 rounded-lg border border-line px-2" />
              <input name="max" defaultValue={q.max} placeholder={t("priceMax")} aria-label={t("priceMax")} inputMode="decimal" dir="ltr" className="min-h-11 rounded-lg border border-line px-2" />
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="available" value="1" defaultChecked={q.available === "1"} />
                {t("availableOnly")}
              </label>
            </>
          }
        />

        <p className="text-sm text-muted">{t("results", { count: total })}</p>
        {rows.length === 0 ? (
          <Card>
            <p>{t("noResults")}</p>
            <p className="mt-2 text-sm text-muted">{t("requestHint")}</p>
            <Link href="/request-part" className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">{t("requestCta")}</Link>
          </Card>
        ) : (
          <ProductGrid rows={rows} locale={locale} />
        )}
        {total > PAGE_SIZE && (
          <nav className="flex justify-center gap-3">
            {page > 1 && <Link href={pageLink(page - 1)} className="rounded-lg border border-line px-4 py-2">{t("prev")}</Link>}
            {page * PAGE_SIZE < total && <Link href={pageLink(page + 1)} className="rounded-lg border border-line px-4 py-2">{t("next")}</Link>}
          </nav>
        )}
      </div>
    </SiteShell>
  );
}
