// اختبار دخان في متصفح حقيقي على نسخة الإنتاج (dist-spa): الصفحات تفتح بلا أعطال لكل دور.
// الاستخدام: npm run build:spa && npm run preview:spa & node tests/smoke.mjs [http://127.0.0.1:4173/]
// ردود Supabase محاكاة بالكامل، فلا يلمس الاختبار أي بيانات حقيقية.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = (email) => ({ access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "00000000-0000-0000-0000-000000000001", email, role: "authenticated", exp })}.sig`, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email, user_metadata: {}, app_metadata: {} } });
const school = { school_id: "sch1", role: "school_admin", status: "active", school_name: "مدرسة الاختبار", school_status: "active" };
const ROLES = {
  parent: { status: "active", platform_roles: [], schools: [], guardian: [{ id: "g1", school_id: "sch1", status: "active" }], driver: null },
  driver: { status: "active", platform_roles: [], schools: [], guardian: [], driver: { id: "d1", school_id: "sch1", status: "active" } },
  school: { status: "active", platform_roles: [], schools: [school], guardian: [], driver: null },
  executive: { status: "active", platform_roles: ["executive"], region: "الخرج", schools: [], guardian: [], driver: null },
  admin: { status: "active", platform_roles: ["super_admin"], region: null, schools: [], guardian: [], driver: null },
};
const launchOptions = { args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : [] };
const failures = [];
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures.push(label); };

const browser = await chromium.launch(launchOptions);
const watch = (page, tag) => page.on("pageerror", (e) => failures.push(`${tag}: ${e.message}`));
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// الصفحة العامة والدخول وسياسة الخصوصية
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); watch(page, "landing");
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 400, contentType: "application/json", body: '{"error":"invalid_grant","error_description":"Invalid login credentials"}' }));
  await page.goto(BASE, { waitUntil: "load" });
  check(await page.locator(".lp-hero h1").isVisible(), "الصفحة الرئيسية تظهر");
  check((await overflowX(page)) <= 1, "لا تمرير أفقي على الجوال");
  await page.click(".lp-login");
  await page.fill("input[type=email]", "nobody@example.com"); await page.fill("input[type=password]", "wrong-pass");
  await page.click(".auth-form-card button.wide-action");
  check(await page.locator(".auth-message").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false), "رسالة خطأ عند بيانات دخول خاطئة");
  await page.click(".auth-tabs button:has-text('حساب جديد')");
  check(await page.locator(".auth-form-card button.wide-action").isDisabled(), "التسجيل معطل قبل الموافقة على الخصوصية");
  await page.goto(BASE + "#privacy", { waitUntil: "load" });
  check((await page.locator(".privacy-body h2").count()) >= 8, "صفحة سياسة الخصوصية");
  await page.context().close();
}

// كل دور: فتح كل صفحات القائمة دون أعطال
for (const [role, access] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session(`${role}@example.com`))]);
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (path.endsWith("/auth/v1/user")) return ok(session(`${role}@example.com`).user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...access, full_name: role, privacy_version: "2026-10" });
    if (path.endsWith("/rest/v1/schools")) return ok(accept.includes("object") ? { id: "sch1", name: "مدرسة الاختبار", latitude: 24.15, longitude: 47.31 } : [{ id: "sch1", name: "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]);
    if (accept.includes("object")) return route.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, role);
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  const items = await page.locator('.masari-sidebar [data-sidebar="menu-button"]').allInnerTexts();
  check(items.length > 0, `${role}: القائمة ظاهرة (${items.length} صفحات)`);
  for (const label of items) {
    await page.locator('.masari-sidebar [data-sidebar="menu-button"]', { hasText: label }).first().click(); await page.waitForTimeout(500);
    const text = (await page.locator("main.content").innerText()).trim();
    check(text.length > 10, `${role}: ${label.trim()}`);
  }
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(`\n${failures.length} فشل:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nكل اختبارات الدخان نجحت.");
