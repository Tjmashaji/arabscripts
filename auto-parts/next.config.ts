import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// سياسة أمان المحتوى: لا سكربتات أو اتصالات أو إطارات من خارج الموقع. الصور الخارجية الوحيدة صور المنتجات من
// تخزين Supabase. 'unsafe-inline' للسكربت مطلوب لسكربتات Next.js المضمّنة (لا يوجد في الكود أي HTML خام).
// تُطبّق في الإنتاج فقط لأن وضع التطوير يحتاج eval لإعادة التحميل.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self'",
  "connect-src 'self' https://vercel.live",
  "frame-src https://vercel.live",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // رفع مستندات الشركاء يمر عبر Server Action (حد الملف 4 ميجابايت؛ حد Vercel لجسم الطلب 4.5).
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          ...(production ? [{ key: "Content-Security-Policy", value: csp }] : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
