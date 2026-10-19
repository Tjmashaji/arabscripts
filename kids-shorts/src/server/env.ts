import { z } from "zod";

// كل الأسرار تُقرأ من متغيرات البيئة على الخادم والعامل فقط. لا شيء هنا يصل إلى المتصفح.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATA_DIR: z.string().default("./data"),
  // مفتاح تشفير رموز يوتيوب المخزنة (AES-256-GCM): 64 حرفًا ست عشريًا
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY يجب أن يكون 64 حرفًا ست عشريًا (32 بايت)"),
  SIGNUP_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
  LOGIN_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(30),
  MAX_AUDIO_MB: z.coerce.number().int().positive().default(15),
  // ربط يوتيوب (OAuth من Google Cloud Console)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // المخرج الذكي للمواضيع المخصصة
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  // التعليق الصوتي
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_multilingual_v2"),
  ELEVENLABS_VOICE_ID: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    throw new Error("إعدادات البيئة غير صالحة: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("، "));
  }
  cached = parsed.data;
  return cached;
}

export const services = () => {
  const e = env();
  return {
    youtube: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    claude: Boolean(e.ANTHROPIC_API_KEY),
    voice: Boolean(e.ELEVENLABS_API_KEY && e.ELEVENLABS_VOICE_ID),
  };
};
