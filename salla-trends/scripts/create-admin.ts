// ينشئ حساب مسؤول للمنصة أو يغير كلمة مروره.
// الاستخدام: MIGRATION_DATABASE_URL=... npx tsx scripts/create-admin.ts admin@example.com "الاسم"
// كلمة المرور تُقرأ من ADMIN_PASSWORD (12 حرفًا على الأقل) حتى لا تظهر في سجل الأوامر.
import { Client } from "pg";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const [email, name = "مسؤول"] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("اكتب البريد: npx tsx scripts/create-admin.ts admin@example.com \"الاسم\"");
  if (password.length < 12) throw new Error("ضع كلمة مرور من 12 حرفًا على الأقل في ADMIN_PASSWORD");
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL غير معرّف");
  const db = new Client({ connectionString: url, options: "-c search_path=trends" });
  await db.connect();
  await db.query(
    "INSERT INTO admins (email, name, password_hash) VALUES (lower($1), $2, $3) ON CONFLICT (email) DO UPDATE SET name = $2, password_hash = $3",
    [email, name, await hashPassword(password)],
  );
  await db.end();
  console.log(`✓ المسؤول ${email} جاهز`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
