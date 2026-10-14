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
  // صفحة حذف الحساب العامة (شرط Google Play): تفتح بلا دخول، وزرها يوصل لصفحة الدخول
  await page.goto(BASE + "#delete-account", { waitUntil: "load" });
  check(await page.locator(".privacy-body h1", { hasText: "حذف حسابك" }).isVisible(), "صفحة حذف الحساب تفتح بلا دخول");
  check((await overflowX(page)) <= 1, "صفحة حذف الحساب بلا تمرير أفقي على الجوال");
  await page.click(".delete-request-login");
  check(await page.locator("input[type=email]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false), "زر حذف الحساب يفتح صفحة الدخول");
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
    if (path.endsWith("/rpc/my_access")) return ok({ ...access, full_name: role, privacy_version: "2026-10-b" });
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
// السائق: إفصاح الموقع داخل التطبيق قبل أول طلب للإذن، والرفض لا يطلب الإذن ولا يُحفظ
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("driver@example.com"))]);
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (path.endsWith("/auth/v1/user")) return ok(session("driver@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.driver, full_name: "driver", privacy_version: "2026-10-b" });
    // رحلة مسندة اليوم حتى يظهر زر «بدء الرحلة»
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    if (path.endsWith("/rest/v1/drivers")) return ok([{ id: "d1", school_id: "sch1", full_name: "سائق", email: "driver@example.com" }]);
    if (path.endsWith("/rest/v1/schools")) return ok([{ id: "sch1", name: "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]);
    if (path.endsWith("/rest/v1/trips")) return ok([{ id: "t1", route_id: "r1", bus_id: null, driver_id: "d1", trip_date: today, status: "scheduled", direction: "to_school", scheduled_start: null, completed_at: null }]);
    if (path.endsWith("/rest/v1/routes")) return ok([{ name: "مسار الاختبار", scheduled_time: "06:30:00", estimated_duration_minutes: 30, bus_id: null }]);
    if (path.endsWith("/rest/v1/route_stops")) return ok([{ label: "منزل", scheduled_time: "06:35:00", latitude: 24.16, longitude: 47.30, radius_m: 250 }, { label: "المدرسة", scheduled_time: "07:00:00", latitude: 24.15, longitude: 47.31, radius_m: 250 }]);
    if (accept.includes("object")) return route.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "driver-disclosure");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  const start = page.locator("button", { hasText: "بدء الرحلة" }).first();
  const dialog = page.locator('[role="alertdialog"]');
  if (await start.count()) {
    await start.click();
    check(await dialog.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false), "السائق: إفصاح الموقع يظهر قبل بدء الرحلة");
    check((await dialog.innerText()).includes("الخلفية"), "السائق: الإفصاح يذكر الموقع في الخلفية");
    await dialog.locator("button", { hasText: "ليس الآن" }).click();
    check(await dialog.waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false), "السائق: «ليس الآن» يغلق الإفصاح");
    check(await page.evaluate(() => localStorage.getItem("masari-location-disclosure")) === null, "السائق: الرفض لا يُحفظ كموافقة");
    await start.click(); await dialog.waitFor({ state: "visible", timeout: 5000 });
    await dialog.locator("button", { hasText: "موافق" }).click();
    check(await page.evaluate(() => localStorage.getItem("masari-location-disclosure")) === "1", "السائق: الموافقة تُحفظ فلا يتكرر السؤال");
  } else check(false, "السائق: زر بدء الرحلة غير موجود");
  await ctx.close();
}
// السائق أثناء رحلة جارية: يعود GPS تلقائيًا بعد إعادة فتح التطبيق، وتخطي المحطة والبلاغ الطارئ يصلان للخادم،
// وانقطاع الإنترنت لا يمسح شاشة الرحلة
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["geolocation"], geolocation: { latitude: 24.16, longitude: 47.30, accuracy: 8 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("masari-location-disclosure", "1"); }, ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("driver@example.com"))]);
  const calls = [];
  let offline = false;
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (route) => {
    if (offline) return route.abort("internetdisconnected");
    const req = route.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON?.() ?? null });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    if (path.endsWith("/auth/v1/user")) return ok(session("driver@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.driver, full_name: "driver", privacy_version: "2026-10-b" });
    if (path.endsWith("/rest/v1/drivers")) return ok([{ id: "d1", school_id: "sch1", full_name: "سائق", email: "driver@example.com" }]);
    if (path.endsWith("/rest/v1/schools")) return ok([{ id: "sch1", name: "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]);
    if (path.endsWith("/rest/v1/trips")) return ok([{ id: "t1", route_id: "r1", bus_id: null, driver_id: "d1", trip_date: today, status: "in_progress", direction: "to_school", scheduled_start: null, completed_at: null }]);
    if (path.endsWith("/rest/v1/routes")) return ok([{ name: "مسار الياسمين", scheduled_time: "06:30:00", estimated_duration_minutes: 30, bus_id: null }]);
    if (path.endsWith("/rest/v1/trip_stops")) return ok([{ id: "ts1", status: "pending", label: "حي النرجس", scheduled_time: "06:35:00", latitude: 24.16, longitude: 47.30, radius_m: 250 }, { id: "ts2", status: "pending", label: "المدرسة", scheduled_time: "07:00:00", latitude: 24.15, longitude: 47.31, radius_m: 250 }]);
    if (accept.includes("object")) return route.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "driver-trip");
  page.on("dialog", (d) => void (d.type() === "prompt" ? d.accept("الطريق مغلق") : d.accept()));
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(3500);
  check(calls.some((c) => c.path.endsWith("/rest/v1/vehicle_locations")), "السائق: GPS يعود تلقائيًا لرحلة جارية بعد فتح التطبيق");
  await page.locator(".skip-stop-link").click(); await page.waitForTimeout(800);
  const skip = calls.find((c) => c.path.endsWith("/rpc/skip_stop"));
  check(skip?.body?.p_stop === "ts1" && skip?.body?.p_reason === "الطريق مغلق", "السائق: تخطي المحطة يُرسل بالسبب");
  await page.locator(".report-btn").click(); await page.waitForTimeout(800);
  const sos = calls.find((c) => c.path.endsWith("/rpc/report_emergency"));
  check(Math.abs((sos?.body?.p_lat ?? 0) - 24.16) < 0.001, "السائق: البلاغ الطارئ يُرسل بموقع الباص الفعلي");
  check((await page.locator(".trip-save").innerText()).includes("تم إرسال البلاغ"), "السائق: «تم الإرسال» يظهر بعد الحفظ فقط");
  // انقطاع الإنترنت ثم إعادة فتح التطبيق: تبقى الرحلة ظاهرة من النسخة المحفوظة
  offline = true;
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
  const body = await page.locator("body").innerText();
  check(body.includes("مسار الياسمين") && !body.includes("بانتظار التفعيل"), "السائق: انقطاع الإنترنت لا يمسح شاشة الرحلة");
  await page.locator(".report-btn").click(); await page.waitForTimeout(800);
  check((await page.evaluate(() => localStorage.getItem("masari-offline-queue-v1") ?? "")).includes("report_emergency"), "السائق: البلاغ بدون إنترنت يُحفظ ويُرسل لاحقًا");
  await ctx.close();
}
// المدرسة: رحلات اليوم من الخادم، والرحلة الملغاة لا تُحسب ويُعاد إنشاؤها بزر، واعتماد الكل، واستيراد ملف، وبحث الطلاب
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("school@example.com"))]);
  const calls = [];
  const stops = [{ id: "s1", stop_order: 1, label: "منزل", stop_type: "pickup", latitude: 24.16, longitude: 47.30, scheduled_time: null }, { id: "s2", stop_order: 2, label: "المدرسة", stop_type: "school", latitude: 24.15, longitude: 47.31, scheduled_time: null }];
  const route = (id, name, driver) => ({ id, name, direction: "to_school", scheduled_time: "06:30:00", estimated_duration_minutes: 30, is_active: true, archived_at: null, days: [0, 1, 2, 3, 4, 5, 6], bus_id: "b" + id, driver_id: driver, route_stops: stops });
  const student = (id, full_name, grade, routeId, home) => ({ id, full_name, grade, service_status: "active", qr_token: "q" + id, photo_path: null, home_latitude: home ? 24.16 : null, home_longitude: home ? 47.30 : null, student_route_assignments: routeId ? [{ id: "a" + id, route_id: routeId, stop_id: "s1" }] : [] });
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => {
    const req = r.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON?.() ?? null });
    if (path.endsWith("/auth/v1/user")) return ok(session("school@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.school, full_name: "school", privacy_version: "2026-10-b" });
    if (path.endsWith("/rpc/create_today_trips")) return ok({ created: 1, skipped: [{ route: "مسار بلا سائق", reason: "NO_DRIVER" }] });
    if (path.endsWith("/rpc/approve_student_requests")) return ok({ approved: 2, errors: [] });
    if (path.endsWith("/rpc/import_students")) return ok({ created: 1, errors: [{ row: 2, name: "", error: "NAME_REQUIRED" }] });
    if (path.endsWith("/rest/v1/schools")) return ok(accept.includes("object") ? { id: "sch1", name: "مدرسة الاختبار", latitude: 24.15, longitude: 47.31, auto_daily_trips: true } : [{ id: "sch1", name: "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]);
    if (path.endsWith("/rest/v1/routes")) return ok([route("r1", "مسار جاهز", "d1"), route("r2", "مسار ملغى", "d2"), route("r3", "مسار بلا سائق", null)]);
    if (path.endsWith("/rest/v1/drivers")) return ok([{ id: "d1", full_name: "سائق أ", status: "active", user_id: "u1" }, { id: "d2", full_name: "سائق ب", status: "active", user_id: "u2" }]);
    if (path.endsWith("/rest/v1/buses")) return ok([{ id: "br1", bus_number: "1", plate_number: "أ", capacity: 30, driver_id: "d1", status: "active" }, { id: "br2", bus_number: "2", plate_number: "ب", capacity: 30, driver_id: "d2", status: "active" }]);
    if (path.endsWith("/rest/v1/students")) return ok([student("x1", "أحمد سعد", "الأول", "r1", true), student("x2", "سارة علي", "الثاني", "r2", true), student("x3", "فهد ناصر", "الأول", null, false)]);
    if (path.endsWith("/rest/v1/trips") && req.method() === "GET") return ok([{ id: "t2", route_id: "r2", status: "cancelled", driver_id: "d2" }]);
    if (path.endsWith("/rest/v1/student_onboarding_requests")) return ok([{ id: "q1", student_name: "طلب أول", status: "pending_parent_account" }, { id: "q2", student_name: "طلب ثان", status: "pending_parent_account" }]);
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "school-ops");
  page.on("dialog", (d) => void d.accept());
  const open = async (label) => { await page.locator('.masari-sidebar [data-sidebar="menu-button"]', { hasText: label }).first().click(); await page.waitForTimeout(800); };
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  await open("رحلات اليوم");
  const main = page.locator("main.content");
  check(await main.locator("button", { hasText: "إنشاء رحلات اليوم (1)" }).count() === 1, "المدرسة: الرحلة الملغاة لا تُعدّ ضمن الجاهز ولا تحجب غيرها");
  check(await main.locator("button", { hasText: "إعادة الإنشاء" }).count() === 1, "المدرسة: زر إعادة إنشاء الرحلة الملغاة");
  await main.locator("button", { hasText: "إنشاء رحلات اليوم" }).click(); await page.waitForTimeout(800);
  check(calls.some((c) => c.path.endsWith("/rpc/create_today_trips") && c.body?.p_school === "sch1"), "المدرسة: إنشاء رحلات اليوم عبر الخادم");
  check((await main.innerText()).includes("مسار بلا سائق: بلا سائق"), "المدرسة: سبب تعذر كل مسار يظهر");
  await main.locator("button", { hasText: "إعادة الإنشاء" }).click(); await page.waitForTimeout(800);
  check(calls.some((c) => c.path.endsWith("/rest/v1/trips") && c.body?.route_id === "r2"), "المدرسة: إعادة إنشاء الرحلة الملغاة");
  await open("الطلبات");
  await main.locator("button", { hasText: "اعتماد الكل (2)" }).click(); await page.waitForTimeout(800);
  check(JSON.stringify(calls.find((c) => c.path.endsWith("/rpc/approve_student_requests"))?.body?.p_ids) === '["q1","q2"]', "المدرسة: اعتماد كل الطلبات مرة واحدة");
  await main.locator("button", { hasText: "استيراد ملف" }).click();
  await main.locator(".import-file input").setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from("﻿اسم الطالب,الصف,بريد ولي الأمر\nنورة خالد,الثالث,p@example.com\n,الثالث,\n") });
  await page.waitForTimeout(300);
  await main.locator("button", { hasText: "استيراد 2 طالب" }).click(); await page.waitForTimeout(800);
  const imp = calls.find((c) => c.path.endsWith("/rpc/import_students"));
  check(imp?.body?.p_rows?.[0]?.name === "نورة خالد" && imp?.body?.p_rows?.[0]?.parent_email === "p@example.com", "المدرسة: استيراد ملف CSV بعناوين عربية");
  check((await main.locator(".import-failures").innerText()).includes("سطر 3"), "المدرسة: الصف الخاطئ يظهر برقم سطره");
  await open("الطلاب");
  await main.locator(".student-search input").fill("احمد");
  check(await main.locator(".ops-student").count() === 1, "المدرسة: البحث بالاسم يتجاهل الهمزات");
  await main.locator(".student-search input").fill("");
  await main.locator('select[aria-label="تصفية"]').selectOption("unassigned");
  check(await main.locator(".ops-student").count() === 1 && (await main.locator(".ops-student").innerText()).includes("فهد"), "المدرسة: تصفية الطلاب بلا مسار");
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(`\n${failures.length} فشل:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nكل اختبارات الدخان نجحت.");
