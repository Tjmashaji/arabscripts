import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

// اختبارات دخان على النسخة المبنية (next build). تتصل بمشروع Supabase الحقيقي للقراءة العامة ومحاولة دخول خاطئة فقط،
// ولا تنشئ حسابات ولا بيانات.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  // متصفح عربي افتراضيًا (السوق الأول السعودية)؛ اختبار منفصل يتحقق من التحويل التلقائي لمتصفح إنجليزي.
  use: { baseURL: `http://127.0.0.1:${port}`, locale: "ar-SA", trace: "off" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
