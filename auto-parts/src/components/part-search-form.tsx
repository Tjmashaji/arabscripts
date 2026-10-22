import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { cx } from "./ui";

type Values = { q?: string; brand?: string; model?: string; year?: string };

// نموذج بحث GET عادي (يعمل بلا JavaScript): اسم القطعة أو رقمها + العلامة + الموديل + السنة.
// filters: حقول تصفية إضافية في نفس النموذج (زر بحث واحد)، مطوية تحت «تصفية النتائج» ومفتوحة إن كان فيها اختيار.
export async function PartSearchForm({ locale, action, values = {}, dark = false, filters, filtersOpen = false }: {
  locale: string; action: string; values?: Values; dark?: boolean; filters?: ReactNode; filtersOpen?: boolean;
}) {
  const t = await getTranslations("catalog");
  const { brands, models } = await getCatalog();
  const field = cx("min-h-11 w-full rounded-lg border px-3 text-base", dark ? "border-white/20 bg-white text-ink" : "border-line bg-card");

  return (
    <form action={action} method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_7rem_auto]">
      <input name="q" defaultValue={values.q} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} maxLength={100} className={field} />
      <select name="brand" defaultValue={values.brand ?? ""} aria-label={t("brand")} className={field}>
        <option value="">{t("brand")}</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {localName(b, locale)}
          </option>
        ))}
      </select>
      <select name="model" defaultValue={values.model ?? ""} aria-label={t("model")} className={field}>
        <option value="">{t("model")}</option>
        {brands.map((b) => {
          const list = models.filter((m) => m.brand_id === b.id && m.enabled);
          return list.length === 0 ? null : (
            <optgroup key={b.id} label={localName(b, locale)}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m, locale)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <input name="year" type="number" min={1990} max={2100} defaultValue={values.year} placeholder={t("year")} aria-label={t("year")} dir="ltr" className={field} />
      <button type="submit" className="min-h-11 rounded-lg bg-accent px-6 font-bold text-white hover:bg-accent-strong">
        {t("search")}
      </button>
      {filters && (
        <details open={filtersOpen} className="group rounded-xl border border-line bg-card text-sm sm:col-span-2 lg:col-span-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 font-bold [&::-webkit-details-marker]:hidden">
            {t("filters")}
            <span aria-hidden="true" className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-5">{filters}</div>
        </details>
      )}
    </form>
  );
}
