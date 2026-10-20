import "server-only";
import { asWorker } from "./db";
import { env } from "./env";
import { upsertOrder, upsertProduct } from "./ingest";
import { getPage, SallaError, userInfo } from "./salla/client";
import { parseOrder, parseProduct } from "./salla/parse";
import { accessTokenFor } from "./stores";

// مهام المزامنة: كل تشغيل ينفذ صفحة واحدة من سلة لكل مهمة ثم يعيد جدولتها، فلا تطول أي دالة عن حد المنصة.
// الويب هوك يكفي للطلبات الجديدة؛ هذه المهام تسحب ما قبل الربط فقط.

type Job = { id: number; store_id: string; kind: "sync_store" | "sync_products" | "backfill_orders"; page: number; attempts: number };
const MAX_ATTEMPTS = 5;
const PER_PAGE = 30;

async function claim(): Promise<Job | undefined> {
  return asWorker((tx) =>
    tx.one<Job>(
      `UPDATE sync_jobs SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM sync_jobs
         WHERE (status = 'queued' AND run_after <= now()) OR (status = 'running' AND locked_at < now() - interval '10 minutes')
         ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, store_id, kind, page, attempts`,
    ),
  );
}

const finish = (id: number, status: "done" | "failed", error: string | null = null) =>
  asWorker((tx) => tx.q("UPDATE sync_jobs SET status = $2, last_error = $3, locked_at = NULL, updated_at = now() WHERE id = $1", [id, status, error]));

const requeue = (id: number, page: number, delaySeconds: number, opts: { error?: string; resetAttempts?: boolean } = {}) =>
  asWorker((tx) =>
    tx.q(
      `UPDATE sync_jobs SET status = 'queued', page = $2, run_after = now() + make_interval(secs => $3), locked_at = NULL,
         last_error = $4, attempts = CASE WHEN $5 THEN 0 ELSE attempts END, updated_at = now() WHERE id = $1`,
      [id, page, delaySeconds, opts.error ?? null, opts.resetAttempts ?? false],
    ),
  );

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ينفذ خطوة واحدة ويعيد رقم الصفحة التالية، أو null إذا اكتملت المهمة
async function step(job: Job): Promise<number | null> {
  const token = await accessTokenFor(job.store_id);

  if (job.kind === "sync_store") {
    const info = await userInfo(token);
    await asWorker((tx) =>
      tx.q("UPDATE stores SET name = $2, domain = coalesce($3, domain), email = coalesce($4, email), updated_at = now() WHERE id = $1", [
        job.store_id, info.name, info.domain, info.email,
      ]),
    );
    return null;
  }

  if (job.kind === "sync_products") {
    const page = await getPage(token, "/products", { page: job.page, per_page: PER_PAGE });
    await asWorker(async (tx) => {
      for (const raw of page.data) {
        const p = parseProduct(raw);
        if (p) await upsertProduct(tx, job.store_id, p);
      }
    });
    return page.currentPage < page.totalPages ? page.currentPage + 1 : null;
  }

  // backfill_orders: قائمة الطلبات ثم تفاصيل كل طلب (فيها المنتجات وعنوان الشحن)
  const from = new Date(Date.now() - env().BACKFILL_DAYS * 24 * 3600 * 1000);
  const page = await getPage<{ id?: number }>(token, "/orders", { page: job.page, per_page: PER_PAGE, from_date: isoDate(from) });
  for (const summary of page.data) {
    if (!summary?.id) continue;
    const detail = (await getPage(token, `/orders/${summary.id}`)).data[0] as Record<string, unknown> | undefined;
    if (!detail) continue;
    if (!Array.isArray(detail.items)) {
      detail.items = (await getPage(token, "/orders/items", { order_id: summary.id })).data;
    }
    const order = parseOrder(detail);
    if (order && order.lines.length) await asWorker((tx) => upsertOrder(tx, job.store_id, order));
  }
  if (page.currentPage < page.totalPages) return page.currentPage + 1;
  await asWorker((tx) => tx.q("UPDATE stores SET last_synced_at = now(), updated_at = now() WHERE id = $1", [job.store_id]));
  return null;
}

export async function runDueJobs(opts: { maxJobs?: number; budgetMs?: number } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const out = { ran: 0, done: 0, requeued: 0, failed: 0 };
  while (out.ran < (opts.maxJobs ?? 20) && Date.now() - started < budget) {
    const job = await claim();
    if (!job) break;
    out.ran++;
    try {
      const next = await step(job);
      if (next === null) {
        await finish(job.id, "done");
        out.done++;
      } else {
        await requeue(job.id, next, 0, { resetAttempts: true });
        out.requeued++;
      }
    } catch (e) {
      const err = e instanceof SallaError ? e : new SallaError("network", (e as Error).message);
      if (err.kind === "rate_limited") {
        await requeue(job.id, job.page, err.retryAfterSeconds ?? 60, { error: err.message, resetAttempts: true });
        out.requeued++;
        break; // حد سلة للمتجر كله، فلا فائدة من الاستمرار الآن
      }
      const retryable = err.kind === "server" || err.kind === "network";
      if (retryable && job.attempts < MAX_ATTEMPTS) {
        await requeue(job.id, job.page, 60 * 2 ** job.attempts, { error: err.message });
        out.requeued++;
      } else {
        await finish(job.id, "failed", err.message);
        out.failed++;
        if (err.kind !== "auth") console.error("[sync] job failed", job.id, job.kind, err.message);
      }
    }
  }
  return out;
}

export async function computeTrends(asOf = new Date()) {
  const e = env();
  return asWorker(async (tx) => {
    const row = await tx.one<{ id: string }>("SELECT app.compute_trends($1, $2, $3, $4) AS id", [
      asOf, e.TRENDS_MIN_STORES, e.TRENDS_MAX_STORE_SHARE, e.TRENDS_MIN_UNITS,
    ]);
    await tx.q("DELETE FROM sessions WHERE expires_at < now()");
    await tx.q("DELETE FROM webhook_events WHERE received_at < now() - interval '30 days'");
    return Number(row!.id);
  });
}
