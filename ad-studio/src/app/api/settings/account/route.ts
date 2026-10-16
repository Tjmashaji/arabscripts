import { z } from "zod";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { AppError } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { withUser } from "@/server/db";

export const PATCH = handler(async ({ req, user }) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(120), current_password: z.string().max(200).optional(), new_password: z.string().min(10, "كلمة المرور الجديدة 10 أحرف على الأقل").max(200).optional() }));
  return withUser(user.id, async (tx) => {
    await tx.q("UPDATE users SET name = $2 WHERE id = $1", [user.id, b.name]);
    if (b.new_password) {
      await rateLimit(`pw:${user.id}`, 10, 3600);
      const row = await tx.one<{ password_hash: string }>("SELECT * FROM app.login_lookup($1)", [user.email]);
      if (!row || !(await verifyPassword(b.current_password ?? "", row.password_hash))) throw new AppError(400, "wrong_password", "كلمة المرور الحالية غير صحيحة.");
      await tx.q("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, await hashPassword(b.new_password)]);
    }
  });
});
