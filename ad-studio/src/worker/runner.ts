// حلقة العامل: تحجز مهمة واحدة بأمان (FOR UPDATE SKIP LOCKED)، تنفّذ خطوة منها، وتحدّث حالتها.
// المهام الطويلة لدى المزود لا تحجز العامل: تُؤجل وتُستعلم لاحقًا.
import { hostname } from "node:os";
import { videoProvider } from "../server/providers/registry";
import { ProviderError } from "../server/providers/types";
import { workerPool, workerTx } from "./db";
import { analyzeStep, directorStep, generateStep, speechStep } from "./handlers/ai";
import { exportStep } from "./handlers/export";
import type { ClaimedJob, StepResult } from "./types";

export const WORKER_ID = `${hostname()}:${process.pid}`;
const STALE_LOCK = "10 minutes";

export async function claim(workerId = WORKER_ID): Promise<ClaimedJob | null> {
  const rows = await workerPool().query<ClaimedJob>(
    `UPDATE ai_jobs SET status = 'processing', locked_at = now(), locked_by = $1, started_at = coalesce(started_at, now()),
       attempts = attempts + CASE WHEN provider_job_id IS NULL THEN 1 ELSE 0 END
     WHERE id = (
       SELECT id FROM ai_jobs
       WHERE status IN ('queued', 'processing') AND run_after <= now() AND (locked_at IS NULL OR locked_at < now() - interval '${STALE_LOCK}')
       ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED
     ) RETURNING *`,
    [workerId],
  );
  return rows.rows[0] ?? null;
}

async function setProgress(id: string, p: number | null, label: string) {
  await workerPool().query("UPDATE ai_jobs SET progress = $2, progress_label = $3, locked_at = now() WHERE id = $1", [id, p, label]);
}

async function complete(job: ClaimedJob, res: Extract<StepResult, { kind: "done" }>) {
  await workerTx(async (tx) => {
    await tx.q(
      `UPDATE ai_jobs SET status = 'completed', output = coalesce(output, '{}') || $2, progress = 100, progress_label = NULL, error = NULL,
         cost_cents = $3, cost_is_estimate = $4, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
      [job.id, res.output, res.cost.costCents, res.cost.costIsEstimate],
    );
    // تسجيل التكلفة مرة واحدة فقط لكل مهمة (فهرس فريد على job_id)
    if (!job.is_simulated && (res.cost.costCents ?? 0) > 0) {
      await tx.q(
        `INSERT INTO usage_ledger (workspace_id, job_id, entry_type, amount_cents, provider, is_estimate, description) VALUES ($1, $2, 'charge', $3, $4, $5, $6)
         ON CONFLICT (job_id, entry_type) WHERE job_id IS NOT NULL DO NOTHING`,
        [job.workspace_id, job.id, res.cost.costCents, job.provider, res.cost.costIsEstimate, job.type],
      );
    }
  });
}

async function fail(job: ClaimedJob, e: unknown) {
  const pe = e instanceof ProviderError ? e : null;
  const message = pe?.userMessage ?? "حدث خطأ غير متوقع أثناء تنفيذ المهمة.";
  if (!pe) console.error(`[worker] job ${job.id} (${job.type}) unexpected error`, e);
  const retry = Boolean(pe?.retryable) && job.attempts < job.max_attempts;
  await workerTx(async (tx) => {
    if (retry) {
      // محاولة جديدة من البداية مع تأخير متزايد
      await tx.q(
        `UPDATE ai_jobs SET status = 'queued', provider_job_id = NULL, error = $2, progress = NULL, progress_label = 'ستُعاد المحاولة',
           run_after = now() + make_interval(secs => $3), locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [job.id, message, 15 * 2 ** job.attempts],
      );
    } else {
      await tx.q(`UPDATE ai_jobs SET status = 'failed', error = $2, progress_label = NULL, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1`, [job.id, message]);
      if (job.type === "generate_speech") await tx.q("UPDATE audio_assets SET status = 'failed' WHERE id = $1", [job.input.audio_id]);
    }
  });
}

async function cancel(job: ClaimedJob) {
  if (job.provider_job_id && job.type === "generate_video") {
    await videoProvider()?.cancel?.(job.provider_job_id).catch(() => {});
  }
  await workerTx(async (tx) => {
    await tx.q("UPDATE ai_jobs SET status = 'cancelled', finished_at = now(), locked_at = NULL, locked_by = NULL, progress_label = NULL WHERE id = $1", [job.id]);
    if (job.type === "generate_speech") await tx.q("UPDATE audio_assets SET status = 'failed' WHERE id = $1", [job.input.audio_id]);
  });
}

async function step(job: ClaimedJob): Promise<StepResult> {
  switch (job.type) {
    case "director":
      return workerTx((tx) => directorStep(tx, job));
    case "analyze_media":
      return workerTx((tx) => analyzeStep(tx, job));
    case "generate_video":
      return workerTx((tx) => generateStep(tx, job, "video"));
    case "generate_image":
      return workerTx((tx) => generateStep(tx, job, "image"));
    case "generate_speech":
      return workerTx((tx) => speechStep(tx, job));
    case "export":
      return exportStep(job, (p, l) => setProgress(job.id, p, l));
    default:
      throw new ProviderError(`unknown job type ${job.type}`, false, "نوع مهمة غير معروف.");
  }
}

// ينفّذ خطوة واحدة؛ يعيد false إذا لم توجد مهام جاهزة
export async function tick(workerId = WORKER_ID): Promise<boolean> {
  const job = await claim(workerId);
  if (!job) return false;
  if (job.cancel_requested) {
    await cancel(job);
    return true;
  }
  try {
    const res = await step(job);
    if (res.kind === "wait") {
      await workerPool().query(
        `UPDATE ai_jobs SET provider_job_id = coalesce($2, provider_job_id), progress = $3, progress_label = $4, output = coalesce(output, '{}') || $5,
           run_after = now() + make_interval(secs => $6), locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [job.id, res.providerJobId ?? null, res.progress, res.label, res.output ?? {}, res.delaySeconds],
      );
    } else await complete(job, res);
  } catch (e) {
    await fail(job, e);
  }
  return true;
}

// يشغّل المهام حتى تفرغ الطابور (مفيد للاختبارات وللتشغيل اليدوي)
export async function drain(maxSteps = 200) {
  for (let i = 0; i < maxSteps; i++) if (!(await tick())) return i;
  return maxSteps;
}
