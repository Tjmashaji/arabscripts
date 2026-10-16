"use client";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, SimBadge, Spinner } from "@/components/ui";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL } from "@/lib/domain";
import { fmtDate, fmtMoney, useData } from "@/lib/client";

type Job = { id: string; type: keyof typeof JOB_TYPE_LABEL; status: keyof typeof JOB_STATUS_LABEL; provider: string; project_id: string | null; is_simulated: boolean; cost_cents: number | null; cost_is_estimate: boolean; error: string | null; attempts: number; created_at: string; finished_at: string | null; progress_label: string | null };
type Usage = { workspace: { name: string; monthly_spend_cap_cents: number; plan_code: string }; monthCents: number; byType: { type: keyof typeof JOB_TYPE_LABEL; n: number; cents: number }[]; ledger: { id: string; amount_cents: number; provider: string; is_estimate: boolean; description: string; created_at: string; entry_type: string }[] };
const TONE = { queued: "neutral", processing: "info", completed: "ok", failed: "danger", cancelled: "warn" } as const;

export default function Jobs() {
  const jobs = useData<{ jobs: Job[] }>("/api/jobs", (d) => (d?.jobs.some((j) => j.status === "queued" || j.status === "processing") ? 3000 : null));
  const usage = useData<Usage>("/api/usage");
  const u = usage.data;
  const pct = u ? Math.min(100, Math.round((u.monthCents / Math.max(1, u.workspace.monthly_spend_cap_cents)) * 100)) : 0;
  return (
    <>
      <PageHeader title="سجل المهام وتكلفة الإنتاج" subtitle="كل عملية توليد أو تحليل أو تصدير، بحالتها وتكلفتها الفعلية كما سجّلها المزود أو قواعد التسعير الموثقة." />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card><p className="text-sm text-muted">إنفاق هذا الشهر</p><p className="font-display text-2xl ltr text-end">{fmtMoney(u?.monthCents ?? 0)}</p></Card>
        <Card>
          <p className="text-sm text-muted">سقف الإنفاق الشهري</p><p className="font-display text-2xl ltr text-end">{fmtMoney(u?.workspace.monthly_spend_cap_cents)}</p>
          <div className="h-2 rounded-full bg-surface-2 mt-2"><div className={`h-full rounded-full ${pct > 85 ? "bg-danger" : "bg-teal"}`} style={{ width: `${pct}%` }} /></div>
          <Link href="/settings" className="text-xs text-accent font-bold">تعديل السقف</Link>
        </Card>
        <Card><p className="text-sm text-muted">مهام هذا الشهر</p><ul className="text-sm mt-1">{(u?.byType ?? []).map((b) => <li key={b.type} className="flex justify-between"><span>{JOB_TYPE_LABEL[b.type]}</span><span className="ltr">{b.n} · {fmtMoney(b.cents)}</span></li>)}</ul></Card>
      </div>
      <Notice tone="info">التكلفة «تقديرية» تعني أنها محسوبة من عدد الرموز أو الأحرف أو الرصيد المعلن وأسعار المزود، لأن المزود لم يُرجع مبلغًا نهائيًا. مهام المحاكاة بلا تكلفة.</Notice>
      <div className="mt-6">
        {jobs.loading ? <Spinner /> : jobs.error ? <Notice tone="danger">{jobs.error.message}</Notice> : !jobs.data?.jobs.length ? (
          <EmptyState icon={<ListChecks className="size-7" />} title="لا مهام بعد">ستظهر هنا مهام المخرج الإبداعي والتوليد والتصدير.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-start"><tr>{["المهمة", "الحالة", "المزود", "المحاولات", "التكلفة", "الوقت", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {jobs.data.jobs.map((j) => (
                  <tr key={j.id} className="border-t border-line align-top">
                    <td className="px-4 py-3"><span className="font-bold">{JOB_TYPE_LABEL[j.type]}</span>{j.error ? <p className="text-xs text-danger mt-1 max-w-xs">{j.error}</p> : j.progress_label && j.status === "processing" ? <p className="text-xs text-muted">{j.progress_label}</p> : null}</td>
                    <td className="px-4 py-3"><Badge tone={TONE[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge> {j.is_simulated ? <SimBadge /> : null}</td>
                    <td className="px-4 py-3 ltr text-start">{j.provider}</td>
                    <td className="px-4 py-3">{j.attempts}</td>
                    <td className="px-4 py-3 ltr text-start">{fmtMoney(j.cost_cents)}{j.cost_is_estimate && j.cost_cents ? " ~" : ""}</td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(j.created_at)}</td>
                    <td className="px-4 py-3">{j.project_id ? <Link className="text-accent font-bold text-xs" href={`/projects/${j.project_id}/produce`}>المشروع</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
