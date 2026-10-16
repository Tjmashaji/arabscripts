"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL } from "@/lib/domain";
import { api, fmtMoney } from "@/lib/client";
import type { Job } from "./project-context";
import { Badge, Notice, Progress, SimBadge } from "./ui";

const TONE = { queued: "neutral", processing: "info", completed: "ok", failed: "danger", cancelled: "warn" } as const;

// حالة مهمة واحدة بوصف مفهوم؛ النسبة تظهر فقط إذا قدّمها المزود
export function JobStatus({ job, onChange, compact }: { job: Job; onChange?: () => void; compact?: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  const active = job.status === "queued" || job.status === "processing";
  async function cancel() {
    setCancelling(true);
    try {
      await api(`/api/jobs/${job.id}/cancel`, { body: {} });
      onChange?.();
    } finally {
      setCancelling(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">{JOB_TYPE_LABEL[job.type as keyof typeof JOB_TYPE_LABEL] ?? job.type}</span>
        <Badge tone={TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
        {job.is_simulated ? <SimBadge /> : null}
        {!compact && job.cost_cents !== null ? <span className="text-xs text-muted">التكلفة: {fmtMoney(job.cost_cents)}{job.cost_is_estimate ? " (تقديرية)" : ""}</span> : null}
        {active ? (
          <button onClick={cancel} disabled={cancelling} className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-ink-2 hover:text-danger">
            <X className="size-3.5" aria-hidden /> إلغاء
          </button>
        ) : null}
      </div>
      {active ? <Progress value={job.progress === null ? null : Number(job.progress)} label={job.progress_label ?? (job.status === "queued" ? "في انتظار العامل الخلفي" : "قيد التنفيذ")} /> : null}
      {job.status === "failed" && job.error ? <Notice tone="danger">{job.error}</Notice> : null}
    </div>
  );
}
