import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { now, q } from "@/server/db";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { body, clientIp, handler, rateLimit } from "@/server/http/route";

const input = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(120),
  email: z.string().trim().toLowerCase().email("البريد الإلكتروني غير صحيح").max(200),
  password: z.string().min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل").max(200),
});

export const POST = handler(async ({ req }) => {
  rateLimit(`signup:${clientIp(req)}`, env().SIGNUP_LIMIT_PER_HOUR, 3600);
  const b = await body(req, input);
  if (q.get("SELECT 1 FROM users WHERE email = ?", b.email)) throw errors.conflict("هذا البريد مسجّل مسبقًا. سجّل الدخول بدلًا من ذلك.");
  const id = randomUUID();
  q.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", id, b.email, b.name, await hashPassword(b.password), now());
  await startSession(id);
  return { ok: true };
}, { auth: false });
