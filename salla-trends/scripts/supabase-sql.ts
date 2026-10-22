// يولّد ملف SQL واحدًا يُلصق في SQL Editor في Supabase: الأدوار الثلاثة ثم كل الترحيلات بدور trends_owner.
// كل شيء في مخطط trends، فيعمل داخل مشروع موجود دون أن يمس جداوله.
// الاستخدام: npx tsx scripts/supabase-sql.ts > setup.sql
// كلمات المرور تُولَّد عشوائيًا وتُطبع في رأس الملف (احفظها: تحتاجها في متغيرات Vercel)، أو مرّرها عبر
// TRENDS_OWNER_PASSWORD وTRENDS_APP_PASSWORD وTRENDS_WORKER_PASSWORD.
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const pw = (env: string) => process.env[env] || randomBytes(18).toString("base64url");
const owner = pw("TRENDS_OWNER_PASSWORD");
const app = pw("TRENDS_APP_PASSWORD");
const worker = pw("TRENDS_WORKER_PASSWORD");
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const dir = path.join(process.cwd(), "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const out = [
  `-- إعداد رادار الترند داخل مشروع Supabase. يُشغَّل مرة واحدة في SQL Editor.`,
  `-- كلمات المرور (احفظها ثم احذف هذا الملف):`,
  `--   trends_owner:  ${owner}`,
  `--   trends_app:    ${app}`,
  `--   trends_worker: ${worker}`,
  ``,
  `DO $$ BEGIN`,
  `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_owner') THEN CREATE ROLE trends_owner LOGIN PASSWORD ${lit(owner)}; END IF;`,
  `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_app') THEN CREATE ROLE trends_app LOGIN NOBYPASSRLS PASSWORD ${lit(app)}; END IF;`,
  `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trends_worker') THEN CREATE ROLE trends_worker LOGIN BYPASSRLS PASSWORD ${lit(worker)}; END IF;`,
  `END $$;`,
  `GRANT trends_owner TO current_user;`,
  `GRANT CREATE ON DATABASE postgres TO trends_owner;`,
  `SET ROLE trends_owner;`,
  `CREATE SCHEMA IF NOT EXISTS trends;`,
  `CREATE TABLE IF NOT EXISTS trends.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
  ...files.flatMap((f) => [``, `-- ═════ ${f} ═════`, readFileSync(path.join(dir, f), "utf8"), `INSERT INTO trends.schema_migrations (name) VALUES (${lit(f)}) ON CONFLICT DO NOTHING;`]),
  ``,
  `RESET ROLE;`,
  `SELECT 'تم إعداد رادار الترند: ' || count(*) || ' ترحيلات' AS result FROM trends.schema_migrations;`,
];
process.stdout.write(out.join("\n") + "\n");
