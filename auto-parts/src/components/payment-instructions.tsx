import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { formatMoney } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/site";
import { reportPayment } from "@/server/shipping-actions";

// تعليمات التحويل البنكي لطلب بانتظار الدفع، ونموذج إبلاغ المالية بالتحويل.
// بلا آيبان في الإعدادات تبقى الرسالة العامة («نتواصل معك»).
export async function PaymentInstructions({ order, settings, locale }: {
  order: { id: string; reference: string; total: string; currency: string; payment_report: string | null };
  settings: PublicSettings;
  locale: string;
}) {
  const t = await getTranslations("quotes");
  if (!settings.bank_iban) return <Alert tone="info">{t("paymentNotice")}</Alert>;
  const iban = settings.bank_iban.replace(/(.{4})/g, "$1 ").trim();
  const rows = [
    settings.bank_name && { label: t("payBank"), value: settings.bank_name, ltr: false },
    settings.bank_account_name && { label: t("payAccountName"), value: settings.bank_account_name, ltr: false },
    { label: t("payIban"), value: iban, ltr: true },
    { label: t("payAmount"), value: formatMoney(order.total, order.currency, locale), ltr: true },
  ].filter((r): r is { label: string; value: string; ltr: boolean } => Boolean(r));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <h3 className="font-bold">{t("payTitle")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted">{r.label}</dt>
            <dd className={r.ltr ? "ltr-value select-all font-bold" : "font-bold"}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">{t("payReferenceHint", { reference: order.reference })}</p>
      <p className="text-xs text-muted">{t("payConfirmNote")}</p>
      {order.payment_report && <Alert tone="success">{t("reportedNotice", { reference: order.payment_report })}</Alert>}
      <form action={reportPayment} className="flex flex-col gap-2 border-t border-line pt-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="orderId" value={order.id} />
        <Field label={t("reportLabel")} htmlFor={`ref-${order.id}`}>
          <Input id={`ref-${order.id}`} name="reference" dir="ltr" minLength={3} maxLength={120} required
            defaultValue={order.payment_report ?? ""} />
        </Field>
        <div><SubmitButton variant="secondary">{t("reportButton")}</SubmitButton></div>
      </form>
    </div>
  );
}
