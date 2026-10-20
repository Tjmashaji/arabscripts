import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, Input, PageTitle, statusTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/catalog";
import { supplierSetOrderStatus } from "@/server/shipping-actions";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type Row = {
  id: string; reference: string; status: string; payment_status: string; created_at: string; request_reference: string;
  description: string; part_number: string | null; quantity: number; city: string; part_unit_price: string | null;
  part_currency: string | null; part_type: string | null;
};

// الطلبات المسندة لمنشأة المورد بعد اختيار عرضه: بنود القطعة فقط، وتحديث التجهيز بعد تسجيل الدفع.
const nextFor: Record<string, "processing" | "ready_to_ship" | undefined> = { paid: "processing", processing: "ready_to_ship" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "supplierOrders" }))("title") };
}

export default async function SupplierOrders({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations("supplierOrders");
  const to = await getTranslations("orderStatus");
  const tp = await getTranslations("partTypes");
  const tc = await getTranslations("catalog");
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_supplier_orders", {});
  const rows = (data ?? []) as Row[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <SiteShell locale={locale} path="/partner/orders">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <Link href="/partner" className="text-sm text-accent">← {(await getTranslations("partner"))("portal")}</Link>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm text-muted">{t("help")}</p>
        {q.saved && <Alert tone="success">{t("saved")}</Alert>}
        {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}
        {rows.length === 0 ? (
          <Card><p className="text-muted">{t("none")}</p></Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const next = r.payment_status === "paid" ? nextFor[r.status] : undefined;
              return (
                <li key={r.id}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold ltr-value">{r.reference}</p>
                        <p className="text-xs text-muted"><span className="ltr-value">{r.request_reference}</span> · {dateFmt.format(new Date(r.created_at))} · {r.city}</p>
                      </div>
                      <Badge tone={statusTone(r.status)}>{to(r.status)}</Badge>
                    </div>
                    <p className="text-sm">{r.description}</p>
                    <p className="text-sm text-muted">
                      {r.part_number && <><span className="ltr-value">{r.part_number}</span> · </>}
                      {tc("quantity")}: {r.quantity}
                      {r.part_type && <> · {tp(r.part_type)}</>}
                      {r.part_unit_price && r.part_currency && <> · <span className="ltr-value">{formatMoney(r.part_unit_price, r.part_currency, locale)}</span></>}
                    </p>
                    {r.payment_status !== "paid" && r.status === "awaiting_payment" && <p className="text-xs text-muted">{t("waitingPayment")}</p>}
                    {next && (
                      <form action={supplierSetOrderStatus} className="flex flex-wrap gap-2">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orderId" value={r.id} />
                        <input type="hidden" name="status" value={next} />
                        <Input name="note" placeholder={t("note")} aria-label={t("note")} maxLength={1000} className="min-w-48 flex-1" />
                        <SubmitButton>{t(`to_${next}`)}</SubmitButton>
                      </form>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
