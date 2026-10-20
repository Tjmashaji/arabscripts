import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui";
import { getCatalog } from "@/lib/catalog-data";
import { formatMoney, localName, productImageUrl } from "@/lib/catalog";

export type ProductRow = {
  id: string; name: string; brand_id: string; category_id: string; part_numbers: string[]; image_path: string | null;
  offers_count: number; min_price_sar: string | null; part_types: string[]; fresh_available: boolean; last_confirmed_at: string | null; total_count: number;
};

// بطاقات نتائج البحث (ap_search_products): الصورة، نوع القطعة، الرقم، أقل سعر بالريال، وحداثة تأكيد التوفر.
export async function ProductGrid({ rows, locale }: { rows: ProductRow[]; locale: string }) {
  const t = await getTranslations("catalog");
  const tp = await getTranslations("partTypes");
  const { brands } = await getCatalog();
  const brandName = new Map(brands.map((b) => [b.id, localName(b, locale)]));
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/products/${r.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card hover:border-accent">
            <div className="flex aspect-[4/3] items-center justify-center bg-surface text-xs text-muted">
              {r.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImageUrl(r.image_path)} alt={r.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                t("noImage")
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex flex-wrap gap-1">
                {r.part_types.map((p) => (
                  <Badge key={p} tone="info">
                    {tp(p)}
                  </Badge>
                ))}
              </div>
              <span className="font-bold">{r.name}</span>
              <span className="text-xs text-muted">{brandName.get(r.brand_id)}</span>
              {r.part_numbers[0] && <span className="ltr-value text-xs text-muted">{r.part_numbers[0]}</span>}
              <span className="mt-auto text-sm">
                {r.min_price_sar ? (
                  <>
                    {t("from")} <span className="font-bold">{formatMoney(r.min_price_sar, "SAR", locale)}</span>
                  </>
                ) : r.offers_count > 0 ? (
                  t("offers", { count: r.offers_count })
                ) : (
                  <span className="text-muted">{t("noOffers")}</span>
                )}
              </span>
              <span className={r.fresh_available ? "text-xs font-bold text-success" : "text-xs text-muted"}>
                {r.last_confirmed_at ? t("lastConfirmed", { date: dateFmt.format(new Date(r.last_confirmed_at)) }) : t("neverConfirmed")}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
