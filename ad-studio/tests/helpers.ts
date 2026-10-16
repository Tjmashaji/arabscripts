import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { anonymous } from "@/server/db";
import { hashPassword } from "@/server/auth/password";

// مستخدم جديد بمساحة خاصة به عبر دالة التسجيل الحقيقية
export async function newUser(name = "مستخدم") {
  const email = `t-${randomUUID().slice(0, 8)}@example.com`;
  const hash = await hashPassword("password-1234");
  const row = await anonymous((tx) => tx.one<{ id: string }>("SELECT app.register_user($1, $2, $3, $4) AS id", [email, name, hash, `مساحة ${name}`]));
  return { id: row!.id, email, name };
}

export async function owner<T>(fn: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export { fixture } from "./fixtures";
