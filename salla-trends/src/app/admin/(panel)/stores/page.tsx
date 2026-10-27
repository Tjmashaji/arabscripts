import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { asAdmin } from "@/server/db";
import { adminStores } from "@/server/queries";

export const metadata: Metadata = { title: "المتاجر" };

const VERIF = { unverified: ["غير موثق", "neutral"], pending: ["قيد المراجعة", "warn"], verified: ["موثق", "ok"], rejected: ["مرفوض", "danger"] } as const;

export default async function AdminStores() {
  const a = await requireAdmin();
  const rows = await asAdmin(a.adminId, adminStores);
  return (
    <>
      <PageHeader title="المتاجر" subtitle={`${num(rows.length)} متجرًا (آخر 200)`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[15px]">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th className="pb-2 font-normal">المتجر</th><th className="pb-2 font-normal">رقم سلة</th><th className="pb-2 font-normal">الحالة</th>
                <th className="pb-2 font-normal">المشاركة</th><th className="pb-2 font-normal">التوثيق</th><th className="pb-2 font-normal">سطور</th>
                <th className="pb-2 font-normal">التثبيت</th><th className="pb-2 font-normal">آخر مزامنة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => {
                const [vl, vt] = VERIF[s.verification_status];
                return (
                  <tr key={s.id}>
                    <td className="py-2"><div>{s.name || "—"}</div>{s.domain ? <div className="ltr text-xs text-muted">{s.domain}</div> : null}</td>
                    <td className="py-2 ltr num text-sm">{s.salla_merchant_id}</td>
                    <td className="py-2"><Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status === "active" ? "نشط" : "حذف التطبيق"}</Badge></td>
                    <td className="py-2">{s.contributes ? <Badge tone="brand">مشارك</Badge> : <Badge>لا</Badge>}</td>
                    <td className="py-2"><Badge tone={vt}>{vl}</Badge></td>
                    <td className="py-2 num">{num(s.lines)}</td>
                    <td className="py-2 text-sm">{date(s.installed_at)}</td>
                    <td className="py-2 text-sm">{dateTime(s.last_synced_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
