// اتصال العامل الخلفي: الدور studio_worker يتجاوز RLS لأنه ينفّذ مهام كل المساحات،
// لذلك كل استعلام هنا مقيّد صراحةً بمعرّف المهمة أو المشروع.
import { Pool } from "pg";
import type { Tx } from "../server/db";

let pool: Pool | undefined;
export function workerPool() {
  const url = process.env.WORKER_DATABASE_URL;
  if (!url) throw new Error("WORKER_DATABASE_URL غير معرّف");
  pool ??= new Pool({ connectionString: url, max: 5 });
  return pool;
}

export async function workerTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await workerPool().connect();
  try {
    await client.query("BEGIN");
    const tx: Tx = { client, q: async (s, p) => (await client.query(s, p)).rows, one: async (s, p) => (await client.query(s, p)).rows[0] };
    const out = await fn(tx);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closeWorkerPool() {
  await pool?.end();
  pool = undefined;
}
