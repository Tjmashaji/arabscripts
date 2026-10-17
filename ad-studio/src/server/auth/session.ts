import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { anonymous } from "../db";
import { env } from "../env";

export const SESSION_COOKIE = "studio_session";
const TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = { id: string; email: string; name: string; isAdmin: boolean };

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent") ?? "";
  await anonymous((tx) => tx.q("SELECT app.create_session($1, $2, $3, $4)", [userId, hashToken(token), ua, TTL_SECONDS]));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // آمن فقط عند العمل عبر https، فيعمل التشغيل المحلي على http://localhost في كل المتصفحات
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await anonymous((tx) => tx.q("SELECT app.delete_session($1)", [hashToken(token)]));
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await anonymous((tx) =>
    tx.one<{ user_id: string; email: string; name: string; is_admin: boolean }>("SELECT * FROM app.session_user($1)", [hashToken(token)]),
  );
  return row ? { id: row.user_id, email: row.email, name: row.name, isAdmin: row.is_admin } : null;
}

// للصفحات: يعيد التوجيه لتسجيل الدخول إذا لم توجد جلسة
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
