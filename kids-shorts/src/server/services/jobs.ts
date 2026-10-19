// نظام المهام: الويب ينشئ المهمة، والعامل (src/worker) يحجزها وينفذها ويحدّث حالتها.
import { randomUUID } from "node:crypto";
import type { JobKind, JobStatus } from "@/lib/domain";
import { now, q } from "../db";
import { errors } from "../http/errors";

export type JobRow = {
  id: string; user_id: string; project_id: string; kind: JobKind; status: JobStatus; payload: string; result: string | null;
  progress: number | null; message: string | null; error: string | null; attempts: number; max_attempts: number;
  run_after: number; locked_at: number | null; created_at: number; updated_at: number;
};

export type Job = { id: string; projectId: string; kind: JobKind; status: JobStatus; progress: number | null; message: string | null; error: string | null; result: unknown; createdAt: number };

export const publicJob = (j: JobRow): Job => ({
  id: j.id, projectId: j.project_id, kind: j.kind, status: j.status, progress: j.progress, message: j.message, error: j.error,
  result: j.result ? JSON.parse(j.result) : null, createdAt: j.created_at,
});

// مهمة نشطة واحدة لكل نوع ومشروع: إعادة الطلب تعيد المهمة الموجودة بدل إنشاء أخرى
export function enqueue(userId: string, projectId: string, kind: JobKind, payload: unknown = {}, maxAttempts = 3): Job {
  const active = q.get<JobRow>("SELECT * FROM jobs WHERE project_id = ? AND kind = ? AND status IN ('queued', 'processing')", projectId, kind);
  if (active) return publicJob(active);
  const id = randomUUID();
  const t = now();
  q.run(
    "INSERT INTO jobs (id, user_id, project_id, kind, payload, max_attempts, run_after, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, userId, projectId, kind, JSON.stringify(payload), maxAttempts, t, "في الانتظار…", t, t,
  );
  return publicJob(q.get<JobRow>("SELECT * FROM jobs WHERE id = ?", id)!);
}

export function getJob(userId: string, id: string) {
  const j = q.get<JobRow>("SELECT * FROM jobs WHERE id = ? AND user_id = ?", id, userId);
  if (!j) throw errors.notFound("المهمة");
  return publicJob(j);
}

export function projectJobs(userId: string, projectId: string) {
  // أحدث مهمة من كل نوع
  return q
    .all<JobRow>("SELECT * FROM jobs WHERE user_id = ? AND project_id = ? AND id IN (SELECT id FROM jobs j2 WHERE j2.project_id = jobs.project_id AND j2.kind = jobs.kind ORDER BY created_at DESC LIMIT 1)", userId, projectId)
    .map(publicJob);
}

export function cancelJob(userId: string, id: string) {
  getJob(userId, id);
  q.run("UPDATE jobs SET status = 'cancelled', message = 'أُلغيت', updated_at = ? WHERE id = ? AND status IN ('queued', 'processing')", now(), id);
  return getJob(userId, id);
}

// ───── للعامل ─────
const STALE_MS = 10 * 60_000;

// حجز ذري: تحديث واحد يختار المهمة ويقفلها (ومهمة عامل متوقف تُستعاد بعد 10 دقائق)
export function claim(): JobRow | undefined {
  const t = now();
  return q.get<JobRow>(
    `UPDATE jobs SET status = 'processing', locked_at = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status = 'queued' AND run_after <= ?) OR (status = 'processing' AND locked_at < ?)
       ORDER BY created_at LIMIT 1
     ) RETURNING *`,
    t, t, t, t - STALE_MS,
  );
}

export function isCancelled(id: string) {
  return q.get<{ status: string }>("SELECT status FROM jobs WHERE id = ?", id)?.status === "cancelled";
}

export function progress(id: string, fraction: number | null, message: string) {
  q.run("UPDATE jobs SET progress = ?, message = ?, locked_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'", fraction, message, now(), now(), id);
}

export function complete(id: string, result: unknown, message = "اكتملت") {
  q.run("UPDATE jobs SET status = 'completed', progress = 1, result = ?, message = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'processing'", JSON.stringify(result ?? null), message, now(), id);
}

export function fail(job: JobRow, userMessage: string, retryable: boolean) {
  if (retryable && job.attempts < job.max_attempts) {
    const delay = 15_000 * 2 ** (job.attempts - 1);
    q.run("UPDATE jobs SET status = 'queued', run_after = ?, locked_at = NULL, message = ?, updated_at = ? WHERE id = ? AND status = 'processing'", now() + delay, `${userMessage} (إعادة المحاولة بعد ${Math.round(delay / 1000)} ثانية)`, now(), job.id);
  } else {
    q.run("UPDATE jobs SET status = 'failed', error = ?, message = ?, updated_at = ? WHERE id = ? AND status = 'processing'", userMessage, userMessage, now(), job.id);
  }
}
