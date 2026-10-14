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
// مدير النظام: «الدخول كـ» مدرسة ثم الرجوع، والمدرسة المختارة لمن يعمل في مدرستين
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("admin@example.com"))]);
  const calls = []; const schoolGets = [];
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON?.() ?? null });
    if (path.endsWith("/auth/v1/user")) return ok(session("admin@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.admin, full_name: "admin", privacy_version: "2026-10-b" });
    if (path.endsWith("/rpc/admin_view_as")) return ok({ kind: "school", school_id: "sch2", school_name: "مدرسة النخيل", label: "مدرسة النخيل" });
    if (path.endsWith("/rest/v1/schools")) { schoolGets.push(url.search); return ok(accept.includes("object") ? { id: "sch2", name: "مدرسة النخيل", latitude: 24.15, longitude: 47.31 } : [{ id: "sch2", name: "مدرسة النخيل", city: "الخرج", latitude: 24.15, longitude: 47.31 }]); }
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "view-as");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  await page.locator('.masari-sidebar [data-sidebar="menu-button"]', { hasText: "الدخول كـ" }).first().click(); await page.waitForTimeout(800);
  await page.locator(".view-as-panel button", { hasText: "الدخول كـمدرسة" }).first().click(); await page.waitForTimeout(1500);
  check(calls.some((c) => c.path.endsWith("/rpc/admin_view_as") && c.body?.p_kind === "school" && c.body?.p_target === "sch2"), "مدير النظام: الدخول كـ مدرسة يمر عبر الخادم (ويُسجَّل)");
  check(await page.locator(".view-as-banner").isVisible(), "مدير النظام: شريط «تشاهد كـ» ظاهر");
  check((await page.locator('.masari-sidebar [data-sidebar="menu-button"]').allInnerTexts()).some((t) => t.includes("رحلات اليوم")), "مدير النظام: قائمة المدرسة تظهر");
  check(schoolGets.some((q) => q.includes("id=eq.sch2")), "مدير النظام: تُحمَّل المدرسة المختارة بالتحديد");
  await page.locator(".view-as-banner button").click(); await page.waitForTimeout(800);
  check(!(await page.locator(".view-as-banner").count()) && (await page.locator('.masari-sidebar [data-sidebar="menu-button"]').allInnerTexts()).some((t) => t.includes("الدخول كـ")), "مدير النظام: الرجوع لحسابه");
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("school@example.com"))]);
  const schoolGets = [];
  const two = { ...ROLES.school, schools: [school, { school_id: "sch2", role: "operations", status: "active", school_name: "مدرسة النخيل", school_status: "active" }] };
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (path.endsWith("/auth/v1/user")) return ok(session("school@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...two, full_name: "school", privacy_version: "2026-10-b" });
    if (path.endsWith("/rest/v1/schools")) { schoolGets.push(url.search); return ok([{ id: url.search.includes("sch2") ? "sch2" : "sch1", name: url.search.includes("sch2") ? "مدرسة النخيل" : "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]); }
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "school-switch");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  check(schoolGets.some((q) => q.includes("id=eq.sch1")), "المدرسة: تُحمَّل مدرسة المستخدم لا أقدم مدرسة");
  await page.locator(".school-switch").selectOption("sch2"); await page.waitForTimeout(1200);
  check(schoolGets.some((q) => q.includes("id=eq.sch2")) && await page.evaluate(() => localStorage.getItem("masari-school-ctx")) === "sch2", "المدرسة: التبديل بين مدرستين ويُحفظ الاختيار");
  await ctx.close();
}
// مدير النظام: صحة النظام، الرد على تذكرة، نشر إعلان، سجل التدقيق. وولي الأمر يفتح تذكرة دعم ويرى شريط الإعلان
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("admin@example.com"))]);
  const calls = [];
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => {
    const req = r.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON?.() ?? null });
    if (path.endsWith("/auth/v1/user")) return ok(session("admin@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.admin, full_name: "admin", privacy_version: "2026-10-b" });
    if (path.endsWith("/rpc/admin_health")) return ok({ date: "2026-10-14", failed_messages_24h: 2, client_errors_24h: 0, open_emergencies: 1, open_alerts: 0, open_tickets: 1, pending_claims: 0,
      routes_without_trips: [{ school: "مدرسة الاختبار", route: "مسار النسيم", reason: "NO_DRIVER" }], stale_trips: [], expiring: [{ kind: "license", school: "مدرسة الاختبار", name: "سائق", date: "2026-10-20" }] });
    if (path.endsWith("/rest/v1/support_tickets")) return ok([{ id: "tk1", subject: "الطالب لا يظهر", category: "bug", status: "open", created_at: "2026-10-14T05:00:00Z", updated_at: "2026-10-14T05:00:00Z", school_id: "sch1", created_by: "u9", schools: { name: "مدرسة الاختبار" } }]);
    if (path.endsWith("/rest/v1/support_ticket_messages")) return ok([{ id: "m1", body: "لا يظهر في الرحلة", from_staff: false, created_at: "2026-10-14T05:00:00Z" }]);
    if (path.endsWith("/rpc/admin_post_announcement")) return ok({ id: "a1", notified: 12 });
    if (path.endsWith("/rpc/admin_audit_search")) return ok([{ id: "l1", created_at: "2026-10-14T05:00:00Z", action: "login", table_name: "auth.users", record_id: "x", actor_email: "pr@example.com", school_name: null, old_values: null, new_values: null }]);
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "admin-suite");
  const open = async (label) => { await page.locator('.masari-sidebar [data-sidebar="menu-button"]', { hasText: label }).first().click(); await page.waitForTimeout(800); };
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  check(calls.some((c) => c.path.endsWith("/rpc/log_login")), "مدير النظام: الدخول يُسجَّل في سجل التدقيق");
  const main = page.locator("main.content");
  await open("صحة النظام");
  check((await main.innerText()).includes("مسار النسيم") && (await main.innerText()).includes("بلا سائق"), "مدير النظام: صحة النظام تعرض المسار بلا رحلة وسببه");
  await open("الدعم الفني");
  await main.locator("button", { hasText: "فتح" }).first().click(); await page.waitForTimeout(600);
  await main.locator('textarea[aria-label="الرد"]').fill("تم الإصلاح");
  await main.locator("button", { hasText: "إرسال" }).first().click(); await page.waitForTimeout(600);
  check(calls.some((c) => c.path.endsWith("/rpc/reply_ticket") && c.body?.p_ticket === "tk1" && c.body?.p_body === "تم الإصلاح"), "مدير النظام: الرد على تذكرة دعم");
  await open("الإعلانات");
  await main.locator("input").first().fill("صيانة مجدولة");
  await main.locator(".claim-grid textarea").fill("سيتوقف النظام عشر دقائق");
  await main.locator("button", { hasText: "نشر الإعلان" }).click(); await page.waitForTimeout(600);
  check(calls.some((c) => c.path.endsWith("/rpc/admin_post_announcement") && c.body?.p_title === "صيانة مجدولة") && (await main.innerText()).includes("12 حساب"), "مدير النظام: نشر إعلان مع إشعار");
  await open("سجل التدقيق");
  check((await main.innerText()).includes("pr@example.com"), "مدير النظام: سجل التدقيق القابل للبحث");
  await open("المستخدمون والصلاحيات");
  check(await main.locator("h2", { hasText: "نقل سائق أو طالب" }).count() === 1, "مدير النظام: أداة النقل بين المدارس");
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("parent@example.com"))]);
  const calls = [];
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, (r) => {
    const req = r.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON?.() ?? null });
    if (path.endsWith("/auth/v1/user")) return ok(session("parent@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.parent, full_name: "parent", privacy_version: "2026-10-b" });
    if (path.endsWith("/rpc/my_announcements")) return ok([{ id: "an1", title: "صيانة", body: "سيتوقف التطبيق الليلة", tone: "warning", starts_at: "2026-10-14T05:00:00Z" }]);
    if (path.endsWith("/rpc/open_ticket")) return ok("tk9");
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  });
  const page = await ctx.newPage(); watch(page, "parent-support");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(2500);
  check(await page.locator(".announcement-banner").isVisible(), "ولي الأمر: شريط الإعلان يظهر");
  await page.locator(".announcement-banner button").click();
  check(!(await page.locator(".announcement-banner").count()) && (await page.evaluate(() => localStorage.getItem("masari-dismissed-announcements") ?? "")).includes("an1"), "ولي الأمر: إخفاء الإعلان يُحفظ");
  await page.locator(".support-card button").click(); await page.waitForTimeout(800);
  const main = page.locator("main.content");
  await main.locator("input").first().fill("الباص تأخر");
  await main.locator(".claim-grid textarea").fill("تأخر الباص نصف ساعة اليوم");
  await main.locator("button", { hasText: "إرسال للدعم الفني" }).click(); await page.waitForTimeout(800);
  check(calls.some((c) => c.path.endsWith("/rpc/open_ticket") && c.body?.p_subject === "الباص تأخر"), "ولي الأمر: «تواصل معنا» يفتح تذكرة دعم");
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  check((await overflowX(page)) <= 1, "ولي الأمر: صفحة الدعم بلا تمرير أفقي على الجوال");
  await ctx.close();
}
// ولي الأمر: عنوان رحلة العودة، موقع قديم لا يُعرض «مباشر»، غياب اليوم كله، الشكوى بلا نجوم وبعد الحفظ فقط، طريقة الدفع، والضغط على الإشعار
{
  const parentRoutes = (opts) => async (r) => {
    const req = r.request(); const path = new URL(req.url()).pathname; const accept = req.headers().accept ?? "";
    const ok = (d, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(d) });
    if (req.method() === "POST") opts.calls.push({ path, body: req.postDataJSON?.() ?? null });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    if (path.endsWith("/auth/v1/user")) return ok(session("parent@example.com").user);
    if (path.endsWith("/rpc/my_access")) return ok({ ...ROLES.parent, full_name: "parent", privacy_version: "2026-10-b" });
    if (path.endsWith("/rest/v1/guardians")) return ok([{ id: "g1", full_name: "أبو سعد", phone: "0500000000", email: "parent@example.com" }]);
    if (path.endsWith("/rest/v1/guardian_students")) return ok([{ students: { id: "st1", school_id: "sch1", full_name: "سعد", grade: "الثالث", home_address: "النسيم", home_label: "البيت", home_latitude: 24.16, home_longitude: 47.30, service_status: "active" } }]);
    if (path.endsWith("/rest/v1/schools")) return ok([{ id: "sch1", name: "مدرسة الاختبار", city: "الخرج", latitude: 24.15, longitude: 47.31 }]);
    if (path.endsWith("/rest/v1/student_route_assignments")) return ok([{ route_id: "r2" }]);
    if (path.endsWith("/rest/v1/trips")) return ok([{ id: "t2", route_id: "r2", bus_id: null, driver_id: "d1", trip_date: today, status: opts.tripStatus, direction: "to_home", scheduled_start: null, completed_at: null }]);
    if (path.endsWith("/rest/v1/routes")) return ok([{ name: "مسار العودة", scheduled_time: "13:00:00", estimated_duration_minutes: 30, bus_id: null }]);
    if (path.endsWith("/rest/v1/route_stops") || path.endsWith("/rest/v1/trip_stops")) return ok([{ id: "s1", status: "pending", label: "المدرسة", scheduled_time: "13:00:00", latitude: 24.15, longitude: 47.31, radius_m: 250 }, { id: "s2", status: "pending", label: "النسيم", scheduled_time: "13:20:00", latitude: 24.16, longitude: 47.30, radius_m: 250 }]);
    if (path.endsWith("/rest/v1/vehicle_locations")) return ok([{ latitude: 24.155, longitude: 47.305, recorded_at: new Date(Date.now() - 10 * 60000).toISOString() }]);
    if (path.endsWith("/rest/v1/notifications") && req.method() === "GET") return ok([{ id: "n1", type: "fee_invoice", title: "فاتورة نقل جديدة", body: "رسوم الفصل", created_at: new Date().toISOString(), read_at: null }]);
    if (path.endsWith("/rest/v1/fee_invoices")) return ok([{ id: "f1", number: "F-1", title: "رسوم النقل", note: "حوّل على الآيبان SA0000", amount: 500, vat_rate: 0, total: 500, due_date: today, status: "unpaid", payment_ref: null, paid_at: null, created_at: today, student_id: "st1", students: { full_name: "سعد", grade: "الثالث" } }]);
    if (path.endsWith("/rest/v1/ratings_feedback") && req.method() === "POST") return ok(null, 201);
    if (path.endsWith("/rest/v1/ratings_feedback")) return ok(opts.feedback);
    if (path.endsWith("/rpc/guardian_absent_today")) return ok(2);
    if (accept.includes("object")) return r.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    return ok(req.method() === "GET" || path.includes("/rpc/") ? [] : null);
  };
  // رحلة العودة جارية بموقع عمره 10 دقائق
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("parent@example.com"))]);
  let opts = { calls: [], tripStatus: "in_progress", feedback: [] };
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, parentRoutes(opts));
  let page = await ctx.newPage(); watch(page, "parent-live");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(3500);
  const head = await page.locator(".map-panel .panel-head").innerText();
  check(head.includes("إلى المنزل"), "ولي الأمر: عنوان رحلة العودة «إلى المنزل»");
  check(head.includes("آخر موقع قبل") && !head.includes("GPS مباشر"), "ولي الأمر: الموقع القديم لا يظهر «GPS مباشر»");
  await page.locator(".icon-button[aria-label='الإشعارات']").click(); await page.waitForTimeout(400);
  await page.locator(".notification-item", { hasText: "فاتورة نقل جديدة" }).click(); await page.waitForTimeout(1000);
  const fees = await page.locator("main.content").innerText();
  check(fees.includes("فواتير النقل"), "ولي الأمر: الضغط على إشعار الفاتورة يفتح الفواتير");
  check(fees.includes("SA0000"), "ولي الأمر: طريقة الدفع (الآيبان) تظهر في الفاتورة");
  await ctx.close();
  // رحلة لم تبدأ: الغياب والشكوى
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-hramsoavpanetdhwpokr-auth-token", JSON.stringify(session("parent@example.com"))]);
  opts = { calls: [], tripStatus: "scheduled", feedback: [{ id: "fb1", category: "شكوى", message: "تأخر الباص أمس", rating: null, status: "closed", reply: "نعتذر وتابعنا مع السائق", replied_at: new Date().toISOString(), created_at: new Date().toISOString() }] };
  await ctx.route(/supabase\.co\/(rest|auth|functions)\/v1\//, parentRoutes(opts));
  page = await ctx.newPage(); watch(page, "parent-absence");
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(3500);
  await page.locator("button", { hasText: "ابني غائب اليوم" }).click(); await page.waitForTimeout(800);
  check(opts.calls.some((c) => c.path.endsWith("/rpc/guardian_absent_today") && c.body?.p_student === "st1" && c.body?.p_absent === true), "ولي الأمر: «ابني غائب اليوم» يسجل الذهاب والعودة");
  check((await page.locator(".trip-save").innerText()).includes("الذهاب والعودة"), "ولي الأمر: رسالة الغياب توضح أنه لليوم كله");
  const panel = page.locator(".feedback-panel");
  check((await panel.innerText()).includes("نعتذر وتابعنا مع السائق"), "ولي الأمر: سجل الملاحظات يبقى بعد الدخول مع رد المدرسة");
  await panel.locator("select").first().selectOption("شكوى");
  check(await panel.locator("select").count() === 1, "ولي الأمر: الشكوى بلا تقييم نجوم");
  await panel.locator("textarea").fill("الباص تأخر نصف ساعة اليوم");
  await panel.locator("button", { hasText: "إرسال للإدارة" }).click(); await page.waitForTimeout(800);
  const fb = opts.calls.find((c) => c.path.endsWith("/rest/v1/ratings_feedback"));
  check(fb?.body?.rating === null && fb?.body?.student_id === "st1" && fb?.body?.school_id === "sch1", "ولي الأمر: الشكوى تُرسل بمعرّف الطالب وبلا تقييم");
  check((await panel.innerText()).includes("وصلت رسالتك"), "ولي الأمر: «وصلت رسالتك» بعد الحفظ فعلًا");
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(`\n${failures.length} فشل:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nكل اختبارات الدخان نجحت.");
