import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Input, PageTitle, Select, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/catalog-data";
import { localName } from "@/lib/catalog";
import { reviewProduct } from "@/server/catalog-actions";
import { localeFrom } from "@/i18n/locales";

const statuses = ["pending_review", "published", "rejected", "suspended", "draft"] as const;
type Row = {
  id: string; name: string; status: string; brand_id: string; review_reason: string | null; updated_at: string;
  organization: { legal_name: string; country_code: string };
  ap_product_identifiers: { kind: string; value: string }[]; ap_vehicle_fitments: { id: string }[]; ap_product_media: { id: string }[];
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminCatalog" }))("products") };
}

export default async function AdminProducts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; done?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/products", "products.publish");
  const q = await searchParams;
  const status = (statuses as readonly string[]).includes(q.status ?? "") ? q.status! : "pending_review";
  const t = await getTranslations("adminCatalog");
  const ts = await getTranslations("productStatus");
  const { brands } = await getCatalog();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_products")
    .select("id, name, status, brand_id, review_reason, updated_at, organization:ap_organizations(legal_name, country_code), ap_product_identifiers(kind, value), ap_vehicle_fitments(id), ap_product_media(id)")
    .eq("status", status)
    .order("updated_at", { ascending: true })
    .limit(100);
  const rows = (data ?? []) as unknown as Row[];
  const brandName = new Map(brands.map((b) => [b.id, localName(b, locale)]));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("products")}</PageTitle>
      {q.done && <Alert tone="success">{t("done")}</Alert>}
      {q.error && <Alert tone="danger">{t("failed")}{q.error}</Alert>}
      <nav className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link key={s} href={{ pathname: "/admin/products", query: { status: s } }}
            className={s === status ? "rounded-full bg-ink px-3 py-1 text-sm text-white" : "rounded-full border border-line px-3 py-1 text-sm"}>
            {ts(s)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card><p className="text-sm text-muted">{t("none")}</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/products/${r.id}`} className="font-bold text-accent" target="_blank">{r.name}</Link>
                    <p className="text-xs text-muted">
                      {brandName.get(r.brand_id)} · {r.organization.legal_name} (<span className="ltr-value">{r.organization.country_code}</span>) ·{" "}
                      <span className="ltr-value">{r.ap_product_identifiers.map((i) => i.value).join(", ")}</span> · 🚗 {r.ap_vehicle_fitments.length} · 🖼 {r.ap_product_media.length}
                    </p>
                    {r.review_reason && <p className="text-sm">{r.review_reason}</p>}
                  </div>
                  <Badge tone={statusTone(r.status === "published" ? "approved" : r.status === "pending_review" ? "under_review" : r.status)}>{ts(r.status)}</Badge>
                </div>
                <form action={reviewProduct} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="productId" value={r.id} />
                  <input type="hidden" name="status" value={status} />
                  <Select name="decision" aria-label={t("status")} defaultValue={r.status === "published" ? "suspended" : "published"}>
                    {r.status !== "published" && <option value="published">{t("publish")}</option>}
                    {r.status === "pending_review" && <option value="rejected">{t("reject")}</option>}
                    <option value="suspended">{t("suspend")}</option>
                  </Select>
                  <Input name="reason" placeholder={t("reason")} aria-label={t("reason")} maxLength={1000} />
                  <SubmitButton>{t("apply")}</SubmitButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
