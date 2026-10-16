import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// اتصال تطبيق الويب: الدور studio_app الخاضع لسياسات RLS
let pool: Pool | undefined;
function appPool() {
  pool ??= new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  return pool;
}

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

async function inTx<T>(p: Pool, setup: (c: PoolClient) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await setup(client);
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

// كل وصول لبيانات المستخدم يمر من هنا: معاملة يُضبط فيها app.user_id فتطبّق RLS العزل
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTx(appPool(), (c) => c.query("SELECT set_config('app.user_id', $1, true)", [userId]).then(() => undefined), fn);
}

// قبل تسجيل الدخول: بلا هوية، فلا يرى إلا ما تسمح به دوال المصادقة
export function anonymous<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTx(appPool(), async () => {}, fn);
}
