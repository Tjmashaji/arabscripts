import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// تجمعا اتصال: التطبيق (يخضع لـ RLS) والعامل (يتجاوزه، للويب هوك والمزامنة والترند فقط)
let appPool: Pool | undefined;
let workerPool: Pool | undefined;
const app = () => (appPool ??= new Pool({ connectionString: env().DATABASE_URL, max: 10 }));
const worker = () => (workerPool ??= new Pool({ connectionString: env().WORKER_DATABASE_URL, max: 5 }));

export type Tx = {
  q: <R extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
  one: <R extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R | undefined>;
  client: PoolClient;
};

function wrap(client: PoolClient): Tx {
  return {
    client,
    q: async (sql, params) => (await client.query(sql, params)).rows,
    one: async (sql, params) => (await client.query(sql, params)).rows[0],
  };
}

async function inTx<T>(p: Pool, settings: Record<string, string>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const [k, v] of Object.entries(settings)) await client.query("SELECT set_config($1, $2, true)", [k, v]);
    const out = await fn(wrap(client));
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// بهوية متجر: RLS يقصر كل قراءة وكتابة على بيانات هذا المتجر
export const asStore = <T>(storeId: string, fn: (tx: Tx) => Promise<T>) => inTx(app(), { "app.store_id": storeId }, fn);
export const asAdmin = <T>(adminId: string, fn: (tx: Tx) => Promise<T>) => inTx(app(), { "app.admin_id": adminId }, fn);
// بلا هوية: لا يرى إلا ما تتيحه دوال الجلسات والصفحات العامة
export const anonymous = <T>(fn: (tx: Tx) => Promise<T>) => inTx(app(), {}, fn);
// العامل: لا يُستدعى إلا من الويب هوك (بعد التحقق من التوقيع) والمهام المجدولة ورد سلة بعد الدخول
export const asWorker = <T>(fn: (tx: Tx) => Promise<T>) => inTx(worker(), {}, fn);

export async function closePools() {
  await Promise.all([appPool?.end(), workerPool?.end()]);
  appPool = workerPool = undefined;
}
