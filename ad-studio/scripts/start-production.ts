// تشغيل الإنتاج في حاوية واحدة (Railway أو أي منصة Docker):
// 1) يجهّز أدوار قاعدة البيانات الثلاثة وقاعدة ad_studio من رابط مدير Postgres (مرة واحدة، وآمن للتكرار)
// 2) يطبّق الترحيلات ويزرع قوالب النظام
// 3) يشغّل تطبيق الويب والعامل الخلفي معًا، وإذا توقف أحدهما تخرج الحاوية لتعيد المنصة تشغيلها
//
// الويب والعامل في حاوية واحدة لأن التخزين محلي (قرص Railway لا يُشارك بين خدمتين).
// عند إضافة تخزين سحابي يمكن فصلهما إلى خدمتين.
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { Client } from "pg";

const ROLES = { owner: "studio_owner", app: "studio_app", worker: "studio_worker" } as const;
const DB_NAME = process.env.STUDIO_DB_NAME || "ad_studio";

function fail(msg: string): never {
  console.error(`[start] ${msg}`);
  process.exit(1);
}

// كلمة مرور كل دور مشتقة من سر واحد، فلا حاجة لثلاثة متغيرات. تغيير السر يغيّرها عند التشغيل التالي.
function rolePassword(secret: string, role: string) {
  return createHmac("sha256", secret).update(`ad-studio:${role}`).digest("hex");
}

function urlFor(admin: URL, role: string, password: string) {
  const u = new URL(admin.toString());
  u.username = role;
  u.password = password;
  u.pathname = `/${DB_NAME}`;
  return u.toString();
}

async function bootstrap(adminUrl: string, secret: string) {
  const admin = new URL(adminUrl);
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const su = await c.query<{ rolsuper: boolean }>("SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
    if (!su.rows[0]?.rolsuper) fail("POSTGRES_ADMIN_URL يجب أن يكون لمستخدم superuser (مثل postgres في Railway)، لإنشاء الأدوار.");
    const attrs = { owner: "LOGIN", app: "LOGIN NOBYPASSRLS", worker: "LOGIN BYPASSRLS" } as const;
    for (const [key, role] of Object.entries(ROLES) as [keyof typeof ROLES, string][]) {
      const pw = rolePassword(secret, role);
      const exists = await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      const lit = (await c.query<{ q: string }>("SELECT quote_literal($1) AS q", [pw])).rows[0].q;
      await c.query(`${verb} ROLE ${role} ${attrs[key]} PASSWORD ${lit}`);
    }
    const db = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
    if (!db.rowCount) {
      await c.query(`CREATE DATABASE "${DB_NAME.replace(/"/g, "")}" OWNER ${ROLES.owner}`);
      console.log(`[start] أُنشئت قاعدة ${DB_NAME}`);
    }
  } finally {
    await c.end();
  }
  return {
    MIGRATION_DATABASE_URL: urlFor(admin, ROLES.owner, rolePassword(secret, ROLES.owner)),
    DATABASE_URL: urlFor(admin, ROLES.app, rolePassword(secret, ROLES.app)),
    WORKER_DATABASE_URL: urlFor(admin, ROLES.worker, rolePassword(secret, ROLES.worker)),
  };
}

const bin = (name: string) => `node_modules/.bin/${name}`;

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(bin(cmd), args, { env, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
  });
}

async function main() {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };

  // روابط قاعدة البيانات: إما ثلاثة روابط جاهزة، أو رابط مدير Postgres ليُجهَّز كل شيء تلقائيًا
  const explicit = env.DATABASE_URL && env.WORKER_DATABASE_URL && env.MIGRATION_DATABASE_URL;
  if (!explicit) {
    if (!env.POSTGRES_ADMIN_URL) fail("عرّف POSTGRES_ADMIN_URL (مثلًا ${{Postgres.DATABASE_URL}} في Railway)، أو الروابط الثلاثة DATABASE_URL وWORKER_DATABASE_URL وMIGRATION_DATABASE_URL.");
    const secret = env.STUDIO_DB_SECRET;
    if (!secret || secret.length < 32) fail("STUDIO_DB_SECRET مطلوب (32 حرفًا على الأقل) لاشتقاق كلمات مرور أدوار قاعدة البيانات.");
    Object.assign(env, await bootstrap(env.POSTGRES_ADMIN_URL, secret));
  }
  delete env.POSTGRES_ADMIN_URL;
  delete env.STUDIO_DB_SECRET;

  // الرابط العام: Railway يوفر النطاق في RAILWAY_PUBLIC_DOMAIN. يجب أن يطابق ما يفتحه المستخدم (فحص CSRF).
  if (!env.APP_URL && env.RAILWAY_PUBLIC_DOMAIN) env.APP_URL = `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  if (!env.APP_URL) fail("APP_URL غير معرّف. فعّل نطاقًا عامًا للخدمة في Railway أو عرّف APP_URL.");

  // التخزين على القرص الدائم (Volume) إن وُجد، وإلا تضيع الملفات مع كل نشر
  if (!env.STORAGE_DIR) {
    if (env.RAILWAY_VOLUME_MOUNT_PATH) env.STORAGE_DIR = `${env.RAILWAY_VOLUME_MOUNT_PATH}/storage`;
    else console.warn("[start] تحذير: لا يوجد Volume ولا STORAGE_DIR؛ الملفات المرفوعة ستُحذف عند إعادة النشر.");
  }
  if (env.STORAGE_DIR) await mkdir(env.STORAGE_DIR, { recursive: true });

  if (!env.FILE_SIGNING_SECRET || env.FILE_SIGNING_SECRET.length < 32) fail("FILE_SIGNING_SECRET مطلوب (32 حرفًا على الأقل).");

  await run("tsx", ["scripts/migrate.ts"], env);
  await run("tsx", ["scripts/seed-system.ts"], env);

  const port = env.PORT || "3000";
  const procs: ChildProcess[] = [
    spawn(bin("next"), ["start", "-H", "0.0.0.0", "-p", port], { env, stdio: "inherit" }),
    spawn(bin("tsx"), ["--conditions=react-server", "src/worker/index.ts"], { env, stdio: "inherit" }),
  ];

  // أول عملية تتوقف تُوقف الأخرى، ثم تخرج الحاوية بنفس الرمز لتعيد المنصة تشغيلها
  let stopping = false;
  let exitCode = 0;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const p of procs) if (p.exitCode === null) p.kill("SIGTERM");
    setTimeout(() => process.exit(exitCode), 15_000).unref();
  };
  for (const p of procs) {
    p.on("exit", (code) => {
      if (!stopping) {
        console.error(`[start] توقفت عملية (${p.spawnargs.slice(1).join(" ")}) بالرمز ${code}`);
        exitCode = code || 1;
      }
      stop();
      if (procs.every((x) => x.exitCode !== null || x.signalCode !== null)) process.exit(exitCode);
    });
  }
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, stop);
  console.log(`[start] الويب على المنفذ ${port}، والعامل الخلفي يعمل. الرابط: ${env.APP_URL}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
