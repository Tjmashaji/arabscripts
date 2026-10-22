// المتغيرات العامة فقط (آمنة للمتصفح). لا يوجد في هذا المشروع أي مفتاح سري حتى الآن.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  },
  // مفتاح موقع Cloudflare Turnstile (عام). فارغ = لا يظهر التحقق (ويجب أن يبقى CAPTCHA معطلًا في Supabase).
  get turnstileSiteKey() {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  },
  get platformName() {
    return process.env.NEXT_PUBLIC_PLATFORM_NAME?.trim() || null;
  },
};
