"use client";
import type { Job } from "@/server/services/jobs";
import { api } from "@/lib/client";
import { Button, Notice, Progress } from "./ui";

export const isActive = (j?: Job | null) => Boolean(j && (j.status === "queued" || j.status === "processing"));

// حالة مهمة جارية أو فاشلة؛ المهمة المكتملة لا تُعرض هنا (نتيجتها تظهر في مكانها)
export function JobStatus({ job, onChange }: { job?: Job | null; onChange: () => void }) {
  if (!job) return null;
  if (isActive(job)) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1"><Progress value={job.progress === null ? null : Math.round(job.progress * 100)} label={job.message ?? "جارٍ التنفيذ…"} /></div>
        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={async () => { await api(`/api/jobs/${job.id}/cancel`, { body: {} }); onChange(); }}>إلغاء</Button>
      </div>
    );
  }
  if (job.status === "failed") return <Notice tone="danger">{job.error ?? "فشلت المهمة."}</Notice>;
  return null;
}
