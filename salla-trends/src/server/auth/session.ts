import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { anonymous, asWorker } from "../db";

export const SESSION_COOKIE = "st_session";
const TTL_SECONDS = 60 * 60 * 24 * 14;

export type StoreViewer = { kind: "store"; storeId: string; storeName: string };
export type AdminViewer = { kind: "admin"; adminId: string; name: string; email: string };
export type Viewer = StoreViewer | AdminViewer;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

async function issue(create: (hash: string, ua: string) => Promise<unknown>) {
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent") ?? "";
  await create(hashToken(token), ua);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

// جلسة التاجر لا تُنشأ إلا من رد سلة بعد الدخول (انظر /api/auth/salla/callback)
export const startStoreSession = (storeId: string) =>
  issue((hash, ua) => asWorker((tx) => tx.q("SELECT app.create_store_session($1, $2, $3, $4)", [storeId, hash, ua, TTL_SECONDS])));

export const startAdminSession = (adminId: string) =>
  issue((hash, ua) => anonymous((tx) => tx.q("SELECT app.create_admin_session($1, $2, $3, $4)", [adminId, hash, ua, TTL_SECONDS])));

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await anonymous((tx) => tx.q("SELECT app.delete_session($1)", [hashToken(token)]));
  jar.delete(SESSION_COOKIE);
}

export async function currentViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await anonymous((tx) =>
    tx.one<{ store_id: string | null; store_name: string | null; admin_id: string | null; admin_name: string | null; admin_email: string | null }>(
      "SELECT * FROM app.session_identity($1)",
      [hashToken(token)],
    ),
  );
  if (!row) return null;
  if (row.store_id) return { kind: "store", storeId: row.store_id, storeName: row.store_name || "متجري" };
  return { kind: "admin", adminId: row.admin_id!, name: row.admin_name ?? "", email: row.admin_email ?? "" };
}

export async function requireStore(): Promise<StoreViewer> {
  const v = await currentViewer();
  if (v?.kind === "store") return v;
  redirect(v?.kind === "admin" ? "/admin" : "/login");
}

export async function requireAdmin(): Promise<AdminViewer> {
  const v = await currentViewer();
  if (v?.kind === "admin") return v;
  redirect("/admin/login");
}
