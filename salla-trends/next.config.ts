import type { NextConfig } from "next";

// سياسة أمان المحتوى: لا سكربتات أو اتصالات من خارج الموقع. تُطبق في الإنتاج فقط لأن وضع التطوير يحتاج eval.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // الدخول عبر سلة يبدأ برابط (GET) لا بنموذج، فيكفي 'self'
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // مستند التوثيق يمر عبر Server Action (حد الملف 4 ميجابايت)
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    ];
    return [
      // الشارة تُعرض داخل متاجر التجار، فلا نمنعها من الظهور خارج موقعنا
      { source: "/api/badge/:id", headers: [...common, { key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
      {
        source: "/((?!api/badge/).*)",
        headers: [...common, { key: "X-Frame-Options", value: "DENY" }, ...(production ? [{ key: "Content-Security-Policy", value: csp }] : [])],
      },
    ];
  },
};

export default nextConfig;
