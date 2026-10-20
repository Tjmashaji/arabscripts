import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import { formatMoney } from "@/lib/catalog";
import { linesTotal } from "@/lib/quotes";

export type QuoteLineRow = {
  id: string; code: string; description: string | null; quantity: number; unit_amount: string | number; amount: string | number;
  status: string; source?: string | null; beneficiary?: string | null; sort_order?: number;
};

// جدول تفصيل التكلفة: كل بند بمبلغه وحالته (مؤكد/تقديري). الإجمالي من قاعدة البيانات إن وُجد.
export async function QuoteBreakdown({ lines, currency, total, locale, showInternal = false }: {
  lines: QuoteLineRow[]; currency: string; total: string | number | null; locale: string; showInternal?: boolean;
}) {
  const t = await getTranslations("quotes");
  const tl = await getTranslations("costLines");
  const money = (v: string | number) => formatMoney(v, currency, locale);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs text-muted">
            <th className="py-2 text-start font-normal">{t("line")}</th>
            <th className="py-2 text-start font-normal">{t("qty")}</th>
            <th className="py-2 text-end font-normal">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {[...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => (
            <tr key={l.id} className="border-b border-line/60 align-top">
              <td className="py-2">
                <span className="font-bold">{tl(l.code)}</span>{" "}
                <Badge tone={l.status === "estimated" ? "info" : "success"}>{t(`lineStatus_${l.status}`)}</Badge>
                {l.description && <p className="text-xs text-muted">{l.description}</p>}
                {showInternal && (l.source || l.beneficiary) && (
                  <p className="text-xs text-muted">{[l.source, l.beneficiary].filter(Boolean).join(" · ")}</p>
                )}
              </td>
              <td className="py-2">{l.quantity} × <span className="ltr-value">{money(l.unit_amount)}</span></td>
              <td className="py-2 text-end ltr-value">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-2 font-bold">{t("total")}</td>
            <td className="py-2 text-end text-lg font-bold ltr-value">{money(total ?? linesTotal(lines))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
