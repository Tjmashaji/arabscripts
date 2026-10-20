import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Alert, Badge, Card, PageTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { formatMoney, localName, productImageUrl } from "@/lib/catalog";
import { localeFrom } from "@/i18n/locales";

type Product = {
  id: string; name: string; description: string | null; status: string; brand_id: string; category_id: string; original_language: string;
  ap_product_identifiers: { kind: string; value: string }[];
  ap_vehicle_fitments: { id: string; model_id: string; year_from: number | null; year_to: number | null; engine: string | null }[];
  ap_product_media: { id: string; storage_path: string; sort_order: number }[];
};
type Offer = {
  id: string; part_type: string; unit_price: string | null; currency: string; origin_country: string | null; lead_time_days: number | null;
  availability_status: string; stock_quantity: number | null; last_confirmed_at: string | null; availability_fresh: boolean; valid_until: string | null;
};

const select = `id, name, description, status, brand_id, category_id, original_language,
  ap_product_identifiers(kind, value), ap_vehicle_fitments(id, model_id, year_from, year_to, engine), ap_product_media(id, storage_path, sort_order)`;

async function loadProduct(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ap_products").select(select).eq("id", id).maybeSingle();
  return data as Product | null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  return { title: product?.name ?? "—" };
}

// تفاصيل القطعة: تعريفها وأرقامها وتوافقها، ثم عروض الموردين كلٌّ بحالة توفره وتاريخ آخر تأكيد.
export default async function ProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) notFound();

  const t = await getTranslations("catalog");
  const tp = await getTranslations("partTypes");
  const ta = await getTranslations("availability");
  const tk = await getTranslations("identifierKinds");
  const { brands, models, categories } = await getCatalog();
  const supabase = await createClient();
  const { data: offerRows } = await supabase.rpc("ap_public_offers", { p_product: product.id });
  const offers = (offerRows ?? []) as Offer[];
  const brand = brands.find((b) => b.id === product.brand_id);
  const category = categories.find((c) => c.id === product.category_id);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const images = [...product.ap_product_media].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <SiteShell locale={locale} path={`/products/${product.id}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
        <nav className="text-sm text-muted">
          <Link href="/products" className="text-accent">{t("title")}</Link>
          {category && <> / <Link href={{ pathname: "/products", query: { category: category.id } }} className="text-accent">{localName(category, locale)}</Link></>}
        </nav>
        {product.status !== "published" && <Alert tone="info">{t("notPublished")}</Alert>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-2">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-surface text-sm text-muted">
              {images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImageUrl(images[0].storage_path)} alt={product.name} className="h-full w-full object-contain" />
              ) : (
                t("noImage")
              )}
            </div>
            {images.length > 1 && (
              <ul className="grid grid-cols-4 gap-2">
                {images.slice(1).map((m) => (
                  <li key={m.id} className="aspect-square overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={productImageUrl(m.storage_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-bold text-accent">{brand && localName(brand, locale)}</p>
              <PageTitle>{product.name}</PageTitle>
            </div>
            {product.description && <p className="whitespace-pre-line text-muted" lang={product.original_language}>{product.description}</p>}
            <Card>
              <h2 className="mb-2 font-bold">{t("partNumbers")}</h2>
              <dl className="grid gap-2 sm:grid-cols-2">
                {product.ap_product_identifiers.map((i) => (
                  <div key={`${i.kind}:${i.value}`}>
                    <dt className="text-xs text-muted">{tk(i.kind)}</dt>
                    <dd className="ltr-value font-bold">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {product.ap_vehicle_fitments.length > 0 && (
              <Card>
                <h2 className="mb-2 font-bold">{t("fitments")}</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {product.ap_vehicle_fitments.map((f) => {
                    const m = modelById.get(f.model_id);
                    const years = f.year_from || f.year_to ? `${f.year_from ?? "…"}–${f.year_to ?? "…"}` : t("fitmentAny");
                    return (
                      <li key={f.id}>
                        {m ? modelLabel(m, locale) : "—"} · <span className="ltr-value">{years}</span>
                        {f.engine && <> · {t("engine")}: <span className="ltr-value">{f.engine}</span></>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        </div>

        <section aria-labelledby="offers" className="flex flex-col gap-3">
          <h2 id="offers" className="text-xl font-bold">{t("offersTitle")}</h2>
          <Alert tone="info">{t("orderNotice")}</Alert>
          {offers.length === 0 ? (
            <Card><p className="text-muted">{t("noOffers")}</p></Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {offers.map((o) => (
                <li key={o.id}>
                  <Card className="flex h-full flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="info">{tp(o.part_type)}</Badge>
                      <Badge tone={o.availability_fresh ? "success" : o.availability_status === "out_of_stock" ? "danger" : "neutral"}>
                        {o.availability_fresh || o.availability_status === "out_of_stock" ? ta(o.availability_status) : ta("pending_confirmation")}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold">{o.unit_price ? formatMoney(o.unit_price, o.currency, locale) : "—"}</p>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-xs text-muted">{t("origin")}</dt><dd className="ltr-value">{o.origin_country ?? "—"}</dd></div>
                      <div><dt className="text-xs text-muted">{t("leadTime")}</dt><dd>{o.lead_time_days != null ? t("days", { count: o.lead_time_days }) : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">{t("quantity")}</dt><dd>{o.stock_quantity ?? t("unknown")}</dd></div>
                    </dl>
                    <p className="text-xs text-muted">
                      {o.last_confirmed_at ? t("lastConfirmed", { date: dateFmt.format(new Date(o.last_confirmed_at)) }) : t("neverConfirmed")}
                      {o.valid_until && <> · {t("validUntil", { date: dateFmt.format(new Date(o.valid_until)) })}</>}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
