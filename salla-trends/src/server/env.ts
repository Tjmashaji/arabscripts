import "server-only";
import { z } from "zod";

// كل الأسرار تُقرأ من متغيرات البيئة على الخادم فقط. لا شيء هنا يصل إلى المتصفح.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // trends_app: صفحات التاجر والإدارة (يخضع لـ RLS)
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  // trends_worker: الويب هوك والمزامنة وحساب الترند
  WORKER_DATABASE_URL: z.string().min(1, "WORKER_DATABASE_URL مطلوب"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // مفتاح تشفير رموز سلة: 32 بايت بترميز base64 (openssl rand -base64 32)
  TOKEN_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY يجب أن يكون 32 بايت بترميز base64"),
  // بيانات التطبيق من بوابة شركاء سلة (Partners Portal)
  SALLA_CLIENT_ID: z.string().optional(),
  SALLA_CLIENT_SECRET: z.string().optional(),
  SALLA_WEBHOOK_SECRET: z.string().optional(),
  SALLA_ACCOUNTS_URL: z.string().url().default("https://accounts.salla.sa"),
  SALLA_API_URL: z.string().url().default("https://api.salla.dev/admin/v2"),
  // رابط تثبيت التطبيق من متجر تطبيقات سلة (يظهر في الصفحة الرئيسية)
  SALLA_INSTALL_URL: z.string().url().optional(),
  // يحمي مسارات المهام المجدولة (/api/cron/*)
  CRON_SECRET: z.string().min(24, "CRON_SECRET يجب أن يكون 24 حرفًا على الأقل").optional(),
  // عتبات الخصوصية والترند
  TRENDS_MIN_STORES: z.coerce.number().int().min(2).default(3),
  TRENDS_MAX_STORE_SHARE: z.coerce.number().gt(0).max(1).default(0.7),
  TRENDS_MIN_UNITS: z.coerce.number().int().positive().default(10),
  // كم يومًا من الطلبات السابقة تُسحب عند ربط متجر جديد
  BACKFILL_DAYS: z.coerce.number().int().positive().max(365).default(90),
  LOGIN_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("إعدادات البيئة غير صالحة: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("، "));
  }
  cached = parsed.data;
  return cached;
}

export const sallaConfigured = () => {
  const e = env();
  return Boolean(e.SALLA_CLIENT_ID && e.SALLA_CLIENT_SECRET);
};
