import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { anonymous } from "@/server/db";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { env } from "@/server/env";

const input = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(120),
  email: z.string().trim().toLowerCase().email("البريد الإلكتروني غير صحيح").max(200),
  password: z.string().min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل").max(200),
  workspace_name: z.string().trim().max(120).optional(),
});

export const POST = handler(async ({ req }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  await rateLimit(`signup:${ip}`, env().SIGNUP_LIMIT_PER_HOUR, 3600);
  const b = await body(req, input);
  const hash = await hashPassword(b.password);
  let userId: string;
  try {
    userId = (await anonymous((tx) => tx.one<{ id: string }>("SELECT app.register_user($1, $2, $3, $4) AS id", [b.email, b.name, hash, b.workspace_name || `مساحة ${b.name}`])))!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw errors.conflict("هذا البريد مسجّل مسبقًا. سجّل الدخول بدلًا من ذلك.");
    throw e;
  }
  await startSession(userId);
  return { ok: true };
}, { auth: false });
