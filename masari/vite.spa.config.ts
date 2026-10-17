import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// بناء ثابت للنشر على Vercel (npm run build:spa). البناء الأصلي لـ Cloudflare يبقى كما هو.
const projectRoot = fileURLToPath(new URL("./", import.meta.url));
// المعاينة المحلية (واختبارات الدخان) تطبّق رؤوس الأمان نفسها التي في vercel.json، فأي شيء تمنعه سياسة المحتوى يظهر في الاختبار
type VercelHeaders = { headers?: { source: string; headers: { key: string; value: string }[] }[] };
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as VercelHeaders;
const securityHeaders = Object.fromEntries((vercel.headers?.find((h) => h.source === "/(.*)")?.headers ?? [])
  .filter((h) => h.key !== "Strict-Transport-Security").map((h) => [h.key, h.value.replace("; upgrade-insecure-requests", "")]));
export default defineConfig({
  root: fileURLToPath(new URL("./spa", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  // مفتاح موقع Turnstile العام (اختياري): يُضبط في Vercel، وبدونه يبقى التحقق متوقفًا
  define: { __TURNSTILE_SITE_KEY__: JSON.stringify(process.env.TURNSTILE_SITE_KEY ?? "") },
  resolve: { alias: { "@": projectRoot } },
  preview: { headers: securityHeaders },
  build: { outDir: fileURLToPath(new URL("./dist-spa", import.meta.url)), emptyOutDir: true },
});
