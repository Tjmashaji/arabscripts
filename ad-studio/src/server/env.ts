import "server-only";
import { z } from "zod";

// كل الأسرار تُقرأ من متغيرات البيئة على الخادم فقط. لا شيء هنا يصل إلى المتصفح.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // مفتاح توقيع الروابط المؤقتة للملفات (32 حرفًا على الأقل)
  FILE_SIGNING_SECRET: z.string().min(32, "FILE_SIGNING_SECRET يجب أن يكون 32 حرفًا على الأقل"),
  STORAGE_DIR: z.string().default("./storage"),
  // حدود محاولات إنشاء الحساب وتسجيل الدخول لكل عنوان IP
  SIGNUP_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
  LOGIN_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(30),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
  // وضع المحاكاة: مسموح افتراضيًا في التطوير فقط
  ALLOW_SIMULATION: z.enum(["true", "false"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_multilingual_v2"),
  ELEVENLABS_CENTS_PER_1K_CHARS: z.coerce.number().nonnegative().default(30),
  RUNWAY_API_KEY: z.string().optional(),
  RUNWAY_MODEL: z.string().default("gen4.5"),
  RUNWAY_MODEL_TEXT: z.string().default("gen4.5"),
  // قيمة الرصيد الواحد لدى Runway بالسنت (حسب خطة حسابك)
  RUNWAY_CENTS_PER_CREDIT: z.coerce.number().nonnegative().default(1),
  // تقدير مسبق لاستهلاك الرصيد في الثانية، يُستخدم فقط لفحص سقف الإنفاق قبل الإرسال
  RUNWAY_EST_CREDITS_PER_SECOND: z.coerce.number().nonnegative().default(12),
});

type Env = z.infer<typeof schema> & { simulationAllowed: boolean };

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("إعدادات البيئة غير صالحة: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("، "));
  }
  const e = parsed.data;
  const simulationAllowed = e.ALLOW_SIMULATION ? e.ALLOW_SIMULATION === "true" : e.NODE_ENV !== "production";
  cached = { ...e, simulationAllowed };
  return cached;
}
