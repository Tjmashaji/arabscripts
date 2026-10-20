import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getSellingOrganizations } from "@/lib/partner-data";
import { getCatalog, modelLabel } from "@/lib/catalog-data";
import { currencies, formatMoney, identifierKinds, localName, offerStatuses, partTypes, productImageUrl } from "@/lib/catalog";
import { countries } from "@/lib/partners";
import {
  addFitment, confirmAvailability, removeFitment, removeProductImage, saveOffer, submitProduct, updateProduct, uploadProductImage,
} from "@/server/catalog-actions";
import { localeFrom } from "@/i18n/locales";

type Product = {
  id: string; organization_id: string; name: string; description: string | null; status: string; brand_id: string; category_id: string;
  review_reason: string | null;
  ap_product_identifiers: { kind: string; value: string }[];
  ap_vehicle_fitments: { id: string; model_id: string; year_from: number | null; year_to: number | null; engine: string | null }[];
  ap_product_media: { id: string; storage_path: string; sort_order: number }[];
};
type Offer = {
  id: string; organization_id: string; part_type: string; unit_price: string | null; currency: string; origin_country: string | null;
  lead_time_days: number | null; availability_status: string; stock_quantity: number | null; last_confirmed_at: string | null;
  valid_until: string | null; status: string; notes: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partnerProducts" }))("title") };
}

export default async function PartnerProduct({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("partnerProducts");
  const tc = await getTranslations("catalog");
  const ts = await getTranslations("productStatus");
  const tp = await getTranslations("partTypes");
  const ta = await getTranslations("availability");
  const to = await getTranslations("offerStatus");
  const tk = await getTranslations("identifierKinds");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_products")
    .select(`id, organization_id, name, description, status, brand_id, category_id, review_reason,
      ap_product_identifiers(kind, value), ap_vehicle_fitments(id, model_id, year_from, year_to, engine), ap_product_media(id, storage_path, sort_order)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const product = data as Product;

  const orgs = await getSellingOrganizations();
  const ownsProduct = orgs.some((o) => o.id === product.organization_id);
  // كل شريك معتمد يرى عروضه فقط (RLS)، ويستطيع إضافة عرض على منتج منشور حتى لو أضافه غيره.
  const { data: offerRows } = orgs.length
    ? await supabase.from("ap_product_offers").select("*").eq("product_id", id).in("organization_id", orgs.map((o) => o.id)).order("created_at")
    : { data: [] };
  const offers = (offerRows ?? []) as Offer[];
  const { brands, models, categories } = await getCatalog();
  const { data: maxAge } = await supabase.from("ap_platform_settings").select("value").eq("key", "availability_max_age_hours").maybeSingle();
  const editable = ownsProduct && ["draft", "rejected"].includes(product.status);
  const canOffer = orgs.length > 0 && (product.status === "published" || ownsProduct);
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const modelById = new Map(models.map((m) => [m.id, m]));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="productId" value={product.id} />
    </>
  );

  const offerForm = (o?: Offer) => (
    <form action={saveOffer} className="grid gap-3 sm:grid-cols-3">
      {hidden}
      <input type="hidden" name="organizationId" value={o?.organization_id ?? orgs[0]?.id} />
      {o && <input type="hidden" name="offerId" value={o.id} />}
      <Field label={tc("partType")} htmlFor={`pt-${o?.id ?? "new"}`}>
        <Select id={`pt-${o?.id ?? "new"}`} name="partType" defaultValue={o?.part_type ?? "aftermarket"}>
          {partTypes.map((p) => <option key={p} value={p}>{tp(p)}</option>)}
        </Select>
      </Field>
      <Field label={t("unitPrice")} htmlFor={`price-${o?.id ?? "new"}`}>
        <Input id={`price-${o?.id ?? "new"}`} name="unitPrice" defaultValue={o?.unit_price ?? ""} inputMode="decimal" pattern="\d{1,9}(\.\d{1,2})?" dir="ltr" />
      </Field>
      <Field label={t("currency")} htmlFor={`cur-${o?.id ?? "new"}`}>
        <Select id={`cur-${o?.id ?? "new"}`} name="currency" defaultValue={o?.currency ?? "SAR"}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label={t("originCountry")} htmlFor={`oc-${o?.id ?? "new"}`}>
        <Input id={`oc-${o?.id ?? "new"}`} name="originCountry" defaultValue={o?.origin_country ?? ""} maxLength={2} list="countries" dir="ltr" />
      </Field>
      <Field label={t("leadTimeDays")} htmlFor={`lt-${o?.id ?? "new"}`}>
        <Input id={`lt-${o?.id ?? "new"}`} name="leadTimeDays" type="number" min={0} max={365} defaultValue={o?.lead_time_days ?? ""} dir="ltr" />
      </Field>
      <Field label={t("validUntil")} htmlFor={`vu-${o?.id ?? "new"}`}>
        <Input id={`vu-${o?.id ?? "new"}`} name="validUntil" type="date" defaultValue={o?.valid_until?.slice(0, 10) ?? ""} dir="ltr" />
      </Field>
      <Field label={t("offerStatus")} htmlFor={`st-${o?.id ?? "new"}`}>
        <Select id={`st-${o?.id ?? "new"}`} name="status" defaultValue={o?.status ?? "draft"}>
          {offerStatuses.map((s) => <option key={s} value={s}>{to(s)}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("notes")} htmlFor={`nt-${o?.id ?? "new"}`}>
          <Input id={`nt-${o?.id ?? "new"}`} name="notes" defaultValue={o?.notes ?? ""} maxLength={1000} />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <SubmitButton variant="secondary">{t("saveOffer")}</SubmitButton>
      </div>
    </form>
  );

  return (
    <SiteShell locale={locale} path={`/partner/products/${id}`}>
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-10">
        <Link href="/partner/products" className="text-sm font-bold text-accent">{t("title")}</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle>{product.name}</PageTitle>
          <Badge tone={statusTone(product.status === "published" ? "approved" : product.status === "pending_review" ? "under_review" : product.status)}>
            {ts(product.status)}
          </Badge>
        </div>
        {q.saved && <Alert tone="success">{t("saved")}</Alert>}
        {q.error && <Alert tone="danger">{t("failed")}{q.error}</Alert>}
        {product.review_reason && <Alert tone="info">{t("reviewReason")}: {product.review_reason}</Alert>}
        {ownsProduct && !editable && <p className="text-sm text-muted">{t("locked")}</p>}
        <datalist id="countries">{countries.map((c) => <option key={c} value={c} />)}</datalist>

        {ownsProduct && (
          <Card>
            <form action={updateProduct} className="grid gap-4 sm:grid-cols-2">
              {hidden}
              <div className="sm:col-span-2">
                <Field label={t("name")} htmlFor="name">
                  <Input id="name" name="name" defaultValue={product.name} required minLength={2} maxLength={200} disabled={!editable} />
                </Field>
              </div>
              <Field label={tc("brand")} htmlFor="brandId">
                <Select id="brandId" name="brandId" defaultValue={product.brand_id} disabled={!editable}>
                  {brands.map((b) => <option key={b.id} value={b.id}>{localName(b, locale)}</option>)}
                </Select>
              </Field>
              <Field label={tc("category")} htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" defaultValue={product.category_id} disabled={!editable}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{localName(c, locale)}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("description")} htmlFor="description">
                  <Textarea id="description" name="description" defaultValue={product.description ?? ""} maxLength={4000} disabled={!editable} />
                </Field>
              </div>
              {identifierKinds.map((k) => (
                <Field key={k} label={tk(k)} hint={t("identifiersHelp")} htmlFor={`ids_${k}`}>
                  <Textarea id={`ids_${k}`} name={`ids_${k}`} dir="ltr" disabled={!editable} className="min-h-16"
                    defaultValue={product.ap_product_identifiers.filter((i) => i.kind === k).map((i) => i.value).join("\n")} />
                </Field>
              ))}
              {editable && <div className="sm:col-span-2"><SubmitButton>{t("save")}</SubmitButton></div>}
            </form>
          </Card>
        )}

        {ownsProduct && (
          <Card id="fitments" className="flex flex-col gap-3">
            <h2 className="font-bold">{tc("fitments")}</h2>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {product.ap_vehicle_fitments.map((f) => {
                const m = modelById.get(f.model_id);
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {m ? modelLabel(m, locale) : "—"} · <span className="ltr-value">{f.year_from ?? "…"}–{f.year_to ?? "…"}</span>
                      {f.engine && <> · <span className="ltr-value">{f.engine}</span></>}
                    </span>
                    {editable && (
                      <form action={removeFitment}>
                        {hidden}
                        <input type="hidden" name="fitmentId" value={f.id} />
                        <SubmitButton variant="danger" className="min-h-9">{t("remove")}</SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {editable && (models.length === 0 ? (
              <p className="text-sm text-muted">{t("noModels")}</p>
            ) : (
              <form action={addFitment} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
                {hidden}
                <Field label={tc("model")} htmlFor="modelId">
                  <Select id="modelId" name="modelId" required>
                    {brands.map((b) => {
                      const list = models.filter((m) => m.brand_id === b.id);
                      return list.length === 0 ? null : (
                        <optgroup key={b.id} label={localName(b, locale)}>
                          {list.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, locale)}</option>)}
                        </optgroup>
                      );
                    })}
                  </Select>
                </Field>
                <Field label={t("yearFrom")} htmlFor="yearFrom"><Input id="yearFrom" name="yearFrom" type="number" min={1990} max={2100} dir="ltr" /></Field>
                <Field label={t("yearTo")} htmlFor="yearTo"><Input id="yearTo" name="yearTo" type="number" min={1990} max={2100} dir="ltr" /></Field>
                <Field label={tc("engine")} htmlFor="engine"><Input id="engine" name="engine" maxLength={80} dir="ltr" /></Field>
                <SubmitButton variant="secondary">{t("fitmentAdd")}</SubmitButton>
              </form>
            ))}
          </Card>
        )}

        {ownsProduct && (
          <Card id="images" className="flex flex-col gap-3">
            <h2 className="font-bold">{t("images")}</h2>
            <p className="text-sm text-muted">{t("imagesHelp")}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...product.ap_product_media].sort((a, b) => a.sort_order - b.sort_order).map((m) => (
                <li key={m.id} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={productImageUrl(m.storage_path)} alt="" className="aspect-square w-full rounded-lg border border-line object-cover" />
                  {editable && (
                    <form action={removeProductImage}>
                      {hidden}
                      <input type="hidden" name="mediaId" value={m.id} />
                      <SubmitButton variant="danger" className="min-h-9 w-full">{t("remove")}</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <form action={uploadProductImage} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {hidden}
                <Input name="file" type="file" required accept="image/jpeg,image/png,image/webp" className="py-2" aria-label={t("upload")} />
                <SubmitButton variant="secondary">{t("upload")}</SubmitButton>
              </form>
            )}
          </Card>
        )}

        {editable && (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t("submitHelp")}</p>
            <form action={submitProduct}>
              {hidden}
              <SubmitButton className="w-full">{t("submit")}</SubmitButton>
            </form>
          </Card>
        )}

        {canOffer && (
          <section id="offers" className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{t("offers")}</h2>
            <p className="text-sm text-muted">{t("offerHelp")}</p>
            {offers.map((o) => (
              <Card key={o.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{tp(o.part_type)}</Badge>
                  <Badge tone={o.status === "active" ? "success" : "neutral"}>{to(o.status)}</Badge>
                  <Badge tone={o.availability_status === "available" ? "success" : "neutral"}>{ta(o.availability_status)}</Badge>
                  <span className="text-sm font-bold">{o.unit_price ? formatMoney(o.unit_price, o.currency, locale) : "—"}</span>
                  <span className="text-xs text-muted">
                    {t("lastConfirmed")}: {o.last_confirmed_at ? dateFmt.format(new Date(o.last_confirmed_at)) : "—"}
                    {o.stock_quantity != null && ` · ${o.stock_quantity}`}
                  </span>
                </div>
                <form action={confirmAvailability} className="flex flex-col gap-2 rounded-lg bg-surface p-3 sm:flex-row sm:items-end">
                  {hidden}
                  <input type="hidden" name="offerId" value={o.id} />
                  <Field label={t("confirm")} htmlFor={`av-${o.id}`}>
                    <Select id={`av-${o.id}`} name="availability" defaultValue="available">
                      {(["available", "out_of_stock", "on_request"] as const).map((s) => <option key={s} value={s}>{ta(s)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("confirmQty")} htmlFor={`qty-${o.id}`}>
                    <Input id={`qty-${o.id}`} name="quantity" type="number" min={0} dir="ltr" />
                  </Field>
                  <SubmitButton>{t("confirm")}</SubmitButton>
                </form>
                <p className="text-xs text-muted">{t("confirmHelp", { hours: Number(maxAge?.value ?? 48) })}</p>
                <details>
                  <summary className="cursor-pointer text-sm font-bold">{t("save")}</summary>
                  <div className="mt-3">{offerForm(o)}</div>
                </details>
              </Card>
            ))}
            <Card>
              <h3 className="mb-3 font-bold">{t("newOffer")}</h3>
              {offerForm()}
            </Card>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
