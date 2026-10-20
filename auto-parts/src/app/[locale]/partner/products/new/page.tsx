import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { getSellingOrganizations } from "@/lib/partner-data";
import { getCatalog } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { createProduct } from "@/server/catalog-actions";
import { localeFrom, localeNames, locales } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partnerProducts" }))("new") };
}

export default async function NewProduct({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations("partnerProducts");
  const tc = await getTranslations("catalog");
  const ta = await getTranslations("adminCatalog");
  const orgs = await getSellingOrganizations();
  const { brands, categories } = await getCatalog();

  return (
    <SiteShell locale={locale} path="/partner/products/new">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <PageTitle>{t("new")}</PageTitle>
        {orgs.length === 0 ? (
          <Alert tone="info">{t("notAllowed")}</Alert>
        ) : (
          <Card>
            {error && <div className="mb-4"><Alert tone="danger">{t("failed")}{error}</Alert></div>}
            <form action={createProduct} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="locale" value={locale} />
              {orgs.length === 1 ? (
                <input type="hidden" name="organizationId" value={orgs[0].id} />
              ) : (
                <div className="sm:col-span-2">
                  <Field label={ta("org")} htmlFor="organizationId">
                    <Select id="organizationId" name="organizationId">
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
              <div className="sm:col-span-2">
                <Field label={t("name")} htmlFor="name">
                  <Input id="name" name="name" required minLength={2} maxLength={200} />
                </Field>
              </div>
              <Field label={tc("brand")} htmlFor="brandId">
                <Select id="brandId" name="brandId" required>
                  {brands.map((b) => <option key={b.id} value={b.id}>{localName(b, locale)}</option>)}
                </Select>
              </Field>
              <Field label={tc("category")} htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" required>
                  {categories.map((c) => <option key={c.id} value={c.id}>{localName(c, locale)}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("description")} htmlFor="description">
                  <Textarea id="description" name="description" maxLength={4000} />
                </Field>
              </div>
              <Field label={t("language")} htmlFor="language">
                <Select id="language" name="language" defaultValue={locale}>
                  {locales.map((l) => <option key={l} value={l} lang={l}>{localeNames[l]}</option>)}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton>{t("create")}</SubmitButton>
              </div>
            </form>
          </Card>
        )}
      </div>
    </SiteShell>
  );
}
