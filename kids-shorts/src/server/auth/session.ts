import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { now, q } from "../db";

export const SESSION_COOKIE = "kids_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type SessionUser = { id: string; email: string; name: string };

// يُخزَّن هاش الرمز فقط، فتسريب قاعدة البيانات لا يكشف الجلسات
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  q.run("DELETE FROM sessions WHERE expires_at < ?", now());
  q.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", hashToken(token), userId, now() + TTL_MS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) q.run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = q.get<SessionUser>(
    "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    hashToken(token),
    now(),
  );
  return row ?? null;
}

// للصفحات: يعيد التوجيه لتسجيل الدخول إذا لم توجد جلسة
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
