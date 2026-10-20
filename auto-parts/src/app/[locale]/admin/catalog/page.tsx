import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getCatalogForStaff, type Model } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { saveModel } from "@/server/catalog-actions";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminCatalog" }))("catalog") };
}

export default async function AdminCatalog({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/catalog", "products.publish");
  const q = await searchParams;
  const t = await getTranslations("adminCatalog");
  const tc = await getTranslations("catalog");
  const { brands, models, categories } = await getCatalogForStaff();

  const modelForm = (m?: Model) => (
    <form action={saveModel} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_6rem_6rem_auto_auto] sm:items-end">
      <input type="hidden" name="locale" value={locale} />
      {m && <input type="hidden" name="modelId" value={m.id} />}
      <Field label={tc("brand")} htmlFor={`b-${m?.id ?? "new"}`}>
        <Select id={`b-${m?.id ?? "new"}`} name="brandId" defaultValue={m?.brand_id}>
          {brands.map((b) => <option key={b.id} value={b.id}>{localName(b, locale)}</option>)}
        </Select>
      </Field>
      <Field label={t("modelName")} htmlFor={`n-${m?.id ?? "new"}`}>
        <Input id={`n-${m?.id ?? "new"}`} name="name" defaultValue={m?.name} required maxLength={80} dir="ltr" />
      </Field>
      <Field label={t("modelNameAr")} htmlFor={`na-${m?.id ?? "new"}`}>
        <Input id={`na-${m?.id ?? "new"}`} name="nameAr" defaultValue={m?.name_ar ?? ""} maxLength={80} />
      </Field>
      <Field label={tc("year")} htmlFor={`yf-${m?.id ?? "new"}`}>
        <Input id={`yf-${m?.id ?? "new"}`} name="yearFrom" type="number" min={1990} max={2100} defaultValue={m?.year_from ?? ""} dir="ltr" />
      </Field>
      <Field label="→" htmlFor={`yt-${m?.id ?? "new"}`}>
        <Input id={`yt-${m?.id ?? "new"}`} name="yearTo" type="number" min={1990} max={2100} defaultValue={m?.year_to ?? ""} dir="ltr" />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={m ? m.enabled : true} />
        {t("enabled")}
      </label>
      <SubmitButton variant={m ? "secondary" : "primary"}>{m ? t("save") : t("addModel")}</SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("catalog")}</PageTitle>
      {q.done && <Alert tone="success">{t("done")}</Alert>}
      {q.error && <Alert tone="danger">{t("failed")}{q.error}</Alert>}
      <Card className="flex flex-col gap-4">
        <h2 className="font-bold">{t("models")}</h2>
        {modelForm()}
        <ul className="flex flex-col gap-3 border-t border-line pt-4">
          {models.map((m) => <li key={m.id}>{modelForm(m)}</li>)}
        </ul>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">{t("brands")}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{brands.map((b) => <li key={b.id} className="rounded-full bg-surface px-3 py-1">{localName(b, locale)}</li>)}</ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">{t("categories")}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{categories.map((c) => <li key={c.id} className="rounded-full bg-surface px-3 py-1">{localName(c, locale)}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
