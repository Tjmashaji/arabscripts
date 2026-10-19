import { z } from "zod";
import { DUMMY_HASH, verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { q } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { body, clientIp, handler, rateLimit } from "@/server/http/route";

const input = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

export const POST = handler(async ({ req }) => {
  rateLimit(`login:${clientIp(req)}`, env().LOGIN_LIMIT_PER_15MIN, 900);
  const b = await body(req, input);
  const u = q.get<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", b.email);
  // نتحقق دائمًا من هاش (حقيقي أو وهمي) حتى لا يكشف زمن الاستجابة وجود البريد
  const ok = await verifyPassword(b.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) throw new AppError(401, "invalid_credentials", "البريد أو كلمة المرور غير صحيحة.");
  await startSession(u.id);
  return { ok: true };
}, { auth: false });
