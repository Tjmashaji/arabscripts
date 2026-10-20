import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { MAX_REQUEST_IMAGES } from "@/lib/quotes";
import { createQuoteRequest } from "@/server/quote-actions";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "quotes" }))("requestTitle") };
}

type ProductRef = { id: string; name: string; brand_id: string; ap_product_identifiers: { value: string }[] };
const knownErrors = ["vin", "phone", "invalid", "privacy", "upload"];

// طلب قطعة غير موجودة، أو طلب تأكيد سعر وتوفر لعرض من صفحة منتج (product/offer في الرابط).
export default async function RequestPart({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string; offer?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const q = await searchParams;
  const nextPath = q.product ? `/request-part?product=${encodeURIComponent(q.product)}${q.offer ? `&offer=${encodeURIComponent(q.offer)}` : ""}` : "/request-part";
  const session = await requireSession(locale, nextPath);
  const t = await getTranslations("quotes");
  const tc = await getTranslations("catalog");
  const { brands, models } = await getCatalog();

  const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/.test(v);
  let product: ProductRef | null = null;
  if (isUuid(q.product)) {
    const supabase = await createClient();
    const { data } = await supabase.from("ap_products").select("id, name, brand_id, ap_product_identifiers(value)")
      .eq("id", q.product!).eq("status", "published").maybeSingle();
    product = data as ProductRef | null;
  }
  const offerId = product && isUuid(q.offer) ? q.offer! : "";

  return (
    <SiteShell locale={locale} path="/request-part">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <PageTitle>{product ? t("confirmTitle") : t("requestTitle")}</PageTitle>
        <p className="text-muted">{product ? t("confirmHelp") : t("requestHelp")}</p>
        {q.error && (
          <Alert tone="danger">{knownErrors.includes(q.error) ? t(`error_${q.error}`) : `${t("failed")}${q.error}`}</Alert>
        )}
        {product && (
          <Alert tone="info">
            {t("forProduct")}: <span className="font-bold">{product.name}</span>
          </Alert>
        )}
        <Card>
          <form action={createQuoteRequest} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="locale" value={locale} />
            {product && <input type="hidden" name="productId" value={product.id} />}
            {offerId && <input type="hidden" name="offerId" value={offerId} />}
            <Field label={tc("brand")} htmlFor="brandId">
              <Select id="brandId" name="brandId" defaultValue={product?.brand_id ?? ""}>
                <option value="">{tc("any")}</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{localName(b, locale)}</option>)}
              </Select>
            </Field>
            <Field label={tc("model")} htmlFor="modelId">
              <Select id="modelId" name="modelId" defaultValue="">
                <option value="">{tc("any")}</option>
                {brands.map((b) => {
                  const list = models.filter((m) => m.brand_id === b.id);
                  return list.length ? (
                    <optgroup key={b.id} label={localName(b, locale)}>
                      {list.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, locale)}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </Select>
            </Field>
            <Field label={tc("year")} htmlFor="year">
              <Input id="year" name="year" inputMode="numeric" pattern="(19|20)[0-9]{2}" dir="ltr" placeholder="2023" />
            </Field>
            <Field label={tc("engine")} htmlFor="engine">
              <Input id="engine" name="engine" maxLength={80} dir="ltr" placeholder="1.5T" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("vin")} hint={t("vinHint")} htmlFor="vin">
                <Input id="vin" name="vin" maxLength={20} dir="ltr" autoCapitalize="characters" spellCheck={false} />
              </Field>
            </div>
            <Field label={t("partNumber")} htmlFor="partNumber">
              <Input id="partNumber" name="partNumber" maxLength={60} dir="ltr" defaultValue={product?.ap_product_identifiers[0]?.value ?? ""} />
            </Field>
            <Field label={tc("quantity")} htmlFor="quantity">
              <Input id="quantity" name="quantity" type="number" min={1} max={999} defaultValue={1} required />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("description")} hint={t("descriptionHint")} htmlFor="description">
                <Textarea id="description" name="description" required minLength={3} maxLength={2000} defaultValue={product?.name ?? ""} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("photos")} hint={t("photosHint", { count: MAX_REQUEST_IMAGES })} htmlFor="photos">
                <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="py-2" />
              </Field>
            </div>
            <Field label={t("city")} htmlFor="city">
              <Input id="city" name="city" required minLength={2} maxLength={80} autoComplete="address-level2" />
            </Field>
            <Field label={t("contactName")} htmlFor="contactName">
              <Input id="contactName" name="contactName" required minLength={2} maxLength={120} defaultValue={session.fullName} autoComplete="name" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("contactPhone")} hint={t("contactPhoneHint")} htmlFor="contactPhone">
                <Input id="contactPhone" name="contactPhone" type="tel" required dir="ltr" defaultValue={session.phone ?? ""} autoComplete="tel" />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="privacy" required className="mt-1 size-4 accent-accent" />
              <span>{t("privacyText")}</span>
            </label>
            <div className="sm:col-span-2">
              <SubmitButton>{t("send")}</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </SiteShell>
  );
}
