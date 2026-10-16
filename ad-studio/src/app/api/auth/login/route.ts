import { z } from "zod";
import { DUMMY_HASH, verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { anonymous } from "@/server/db";
import { AppError } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { env } from "@/server/env";

const input = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

export const POST = handler(async ({ req }) => {
  const b = await body(req, input);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  await rateLimit(`login:${ip}`, env().LOGIN_LIMIT_PER_15MIN, 900);
  await rateLimit(`login:${b.email}`, 10, 900);
  const row = await anonymous((tx) => tx.one<{ user_id: string; password_hash: string }>("SELECT * FROM app.login_lookup($1)", [b.email]));
  const ok = await verifyPassword(b.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new AppError(401, "invalid_credentials", "البريد أو كلمة المرور غير صحيحة.");
  await startSession(row.user_id);
  return { ok: true };
}, { auth: false });
