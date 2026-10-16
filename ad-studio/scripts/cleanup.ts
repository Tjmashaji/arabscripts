// سياسة الاحتفاظ والحذف: تُشغَّل دوريًا (cron) مثل: npm run cleanup
// - تحذف فعليًا ملفات الوسائط المحذوفة منطقيًا بعد RETENTION_DAYS يومًا (افتراضيًا 30)
// - تحذف الجلسات المنتهية
// - تحذف المشاريع المحذوفة منطقيًا بعد نفس المهلة (مع ملفاتها)
import { closeWorkerPool, workerTx } from "../src/worker/db";
import { storage } from "../src/server/media/storage";

const days = Number(process.env.RETENTION_DAYS ?? 30);

async function main() {
  const store = storage();
  const files = await workerTx((tx) =>
    tx.q<{ id: string; storage_key: string }>(
      `SELECT m.id, m.storage_key FROM media_assets m LEFT JOIN projects p ON p.id = m.project_id
       WHERE (m.deleted_at < now() - make_interval(days => $1)) OR (p.deleted_at < now() - make_interval(days => $1))`,
      [days],
    ),
  );
  for (const f of files) await store.remove(f.storage_key);
  const removed = await workerTx(async (tx) => {
    const a = await tx.q("DELETE FROM media_assets WHERE id = ANY($1) RETURNING id", [files.map((f) => f.id)]);
    const p = await tx.q("DELETE FROM projects WHERE deleted_at < now() - make_interval(days => $1) RETURNING id", [days]);
    const s = await tx.q("DELETE FROM sessions WHERE expires_at < now() RETURNING id");
    return { assets: a.length, projects: p.length, sessions: s.length };
  });
  console.log(`تنظيف: ${removed.assets} ملفات، ${removed.projects} مشاريع، ${removed.sessions} جلسات منتهية (مهلة الاحتفاظ ${days} يومًا)`);
  await closeWorkerPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
