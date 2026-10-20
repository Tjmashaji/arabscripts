import type { Metadata } from "next";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { dateTime, num } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { asAdmin } from "@/server/db";
import { adminOverview, latestRun } from "@/server/queries";

export const metadata: Metadata = { title: "الإدارة" };

export default async function AdminHome() {
  const a = await requireAdmin();
  const { o, run, errors } = await asAdmin(a.adminId, async (tx) => ({
    o: (await adminOverview(tx))!,
    run: await latestRun(tx),
    errors: await tx.q<{ event: string; error: string; received_at: Date }>(
      "SELECT event, error, received_at FROM webhook_events WHERE error IS NOT NULL ORDER BY received_at DESC LIMIT 10",
    ),
  }));
  return (
    <>
      <PageHeader title="نظرة عامة" subtitle={run ? `آخر حساب للترند ${dateTime(run.finished_at)} · ${num(run.items)} صفًا` : "لم يُحسب الترند بعد."} />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="متاجر نشطة" value={num(o.active)} hint={`من ${num(o.stores)} ثبتت التطبيق`} />
        <Stat label="متاجر مشاركة" value={num(o.contributing)} />
        <Stat label="متاجر موثقة" value={num(o.verified)} hint={`${num(o.pending)} طلب بانتظار المراجعة`} />
        <Stat label="سطور طلبات (30 يومًا)" value={num(o.lines_30d)} />
        <Stat label="أحداث فشلت معالجتها (7 أيام)" value={num(o.webhook_errors)} />
        <Stat label="مهام مزامنة متعثرة (7 أيام)" value={num(o.failed_jobs)} />
      </div>
      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-lg">آخر ملاحظات الويب هوك</h2>
        {errors.length === 0 ? <Empty title="لا شيء" /> : (
          <ul className="divide-y divide-line text-sm">
            {errors.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-3 py-2"><span className="ltr font-mono">{e.event}</span><span className="text-ink-2">{e.error}</span><span className="ms-auto text-muted">{dateTime(e.received_at)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
