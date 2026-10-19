// العامل الخلفي: يحجز المهام من SQLite وينفذها واحدة تلو الأخرى. شغّله بجانب التطبيق: npm run worker
import { claim, fail } from "@/server/services/jobs";
import { q } from "@/server/db";
import { ProviderError } from "@/server/providers/types";
import { HANDLERS } from "./handlers";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

export async function runOnce() {
  const job = claim();
  if (!job) return false;
  const started = Date.now();
  try {
    const h = HANDLERS[job.kind];
    if (!h) throw new ProviderError(`unknown kind ${job.kind}`, false, "نوع مهمة غير معروف.");
    await h(job);
    console.log(`[worker] ${job.kind} ${job.id} done in ${Date.now() - started}ms`);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : null;
    console.error(`[worker] ${job.kind} ${job.id} failed:`, e);
    // أخطاء FFmpeg والشبكة غير المتوقعة قابلة لإعادة المحاولة
    fail(job, pe?.userMessage ?? (e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : "حدث خطأ غير متوقع أثناء التنفيذ."), pe ? pe.retryable : true);
    if (job.kind === "upload" && (!pe || !pe.retryable)) q.run("UPDATE uploads SET status = 'failed' WHERE job_id = ?", job.id);
  }
  return true;
}

async function main() {
  console.log("[worker] started");
  while (!stopping) {
    const worked = await runOnce().catch((e) => (console.error("[worker] loop error", e), false));
    if (!worked) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("[worker] stopped");
}

if (process.argv[1]?.endsWith("worker/index.ts")) void main();
