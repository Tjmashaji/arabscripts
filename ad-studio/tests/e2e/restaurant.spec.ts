// اختبار الواجهة من البداية للنهاية: سيناريو إعلان المطعم 30 ثانية عبر المتصفح فعليًا.
import { expect, test, type Page } from "@playwright/test";
import { fixture } from "../fixtures";

const SCRIPT = "تدور مكان يضبط مزاجك؟ لحظة… شوف وش لقينا! أجواء تفتح النفس، وأكل من أول نظرة يخليك تجوع. شوف الطراوة… شوف القرمشة… والله المكان هذا يستاهل التجربة. لا تفوّتك، تعال جرّب بنفسك. [اسم المطعم]… ننتظرك!";
const shots = process.env.E2E_SHOTS;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test("رحلة إنشاء إعلان مطعم كاملة حتى التصدير", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/");
  await snap(page, "01-landing");
  await page.getByRole("link", { name: "ابدأ مجانًا" }).click();
  await page.getByLabel("الاسم").fill("صاحب مطعم");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("password-1234");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();

  // الخطوة 1: بيانات النشاط
  await expect(page.getByRole("heading", { name: "مشروع إعلاني جديد" })).toBeVisible();
  await page.getByLabel("اسم النشاط التجاري").fill("مطعم الجمر");
  await page.getByRole("radio", { name: "المطاعم والمقاهي" }).click();
  await page.getByLabel("وصف المنتج أو الخدمة").fill("مشويات على الفحم وأطباق شعبية");
  await snap(page, "02-new-project");
  await page.getByRole("button", { name: "متابعة إلى رفع المواد" }).click();

  // الخطوة 2: رفع مواد حقيقية
  await expect(page.getByRole("heading", { name: "ارفع موادك" })).toBeVisible();
  const upload = async (role: string, file: Parameters<typeof fixture>[0]) => {
    await page.getByLabel("نوع المادة").selectOption(role);
    await page.getByLabel("اختيار ملفات للرفع").setInputFiles(fixture(file).path);
  };
  await upload("place", "clip.mp4");
  await upload("product", "photo.jpg");
  await upload("product", "clip2.mp4");
  await upload("logo", "logo.png");
  await expect(page.locator("li", { hasText: "logo.png" }).first()).toBeVisible();
  // الموسيقى تتطلب مصدرًا وإقرار ترخيص
  await page.getByLabel("نوع المادة").selectOption("music");
  await page.getByLabel("اختيار ملفات للرفع").setInputFiles(fixture("music.mp3").path);
  await page.getByLabel("مصدر الموسيقى").fill("مكتبة مرخّصة");
  await page.getByText("أؤكد أن ترخيص هذه الموسيقى").click();
  await page.getByRole("button", { name: "رفع", exact: true }).click();
  await expect(page.getByText("music.mp3").first()).toBeVisible();
  // ملف مزيّف يُرفض برسالة واضحة
  await page.getByLabel("نوع المادة").selectOption("product");
  await page.getByLabel("اختيار ملفات للرفع").setInputFiles(fixture("fake.txt").path);
  await expect(page.getByText("نوع الملف غير مدعوم").first()).toBeVisible();
  await snap(page, "03-media");
  await page.getByRole("link", { name: "التالي: الإعداد والفكرة" }).click();

  // الخطوة 3: الإعداد وطريقة العمل
  await page.getByRole("radio", { name: "ترندي" }).click();
  await page.getByLabel("المدة (ثانية)").selectOption("30");
  await page.getByRole("radio", { name: /لدي فكرة جاهزة/ }).click();
  await page.getByLabel("فكرتك أو السيناريو").fill(SCRIPT);
  await snap(page, "04-setup");
  await page.getByRole("button", { name: "ولّد السيناريو والمشاهد" }).click();
  await expect(page.getByRole("link", { name: "افتح السيناريو والمشاهد" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "افتح السيناريو والمشاهد" }).click();

  // الخطوة 4: السيناريو والمشاهد
  await expect(page.getByRole("heading", { name: "المشاهد (5)" })).toBeVisible();
  await expect(page.getByText("المجموع 30 ث من 30 ث")).toBeVisible();
  await expect(page.getByText("مطعم الجمر… ننتظرك!").first()).toBeVisible();
  const onScreen = page.getByLabel("النص على الشاشة").first();
  await onScreen.fill("وين تتعشى الليلة؟");
  await onScreen.blur();
  await expect(page.getByText("يحفظ…")).toHaveCount(0, { timeout: 10_000 });
  await snap(page, "05-script");
  await page.getByRole("link", { name: "التالي: التوليد والصوت" }).click();

  // الخطوة 5: إسناد المواد وتوليد مشهد والتعليق الصوتي
  await expect(page.getByRole("heading", { name: "التعليق الصوتي" })).toBeVisible();
  const picks = ["clip.mp4", "photo.jpg", "clip2.mp4", "clip.mp4"];
  for (const [i, name] of picks.entries()) {
    const select = page.getByLabel("استخدم مادة من مكتبتك").nth(i);
    const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
    await select.selectOption(value!);
    await expect(page.getByText("مادة حقيقية").nth(i)).toBeVisible();
  }
  await page.getByRole("button", { name: "ولّد فيديو للمشهد" }).nth(4).click();
  await page.getByRole("button", { name: "ولّد للكل" }).click();
  await expect(page.getByText("مولّد", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("audio[src]")).toHaveCount(5, { timeout: 90_000 });
  await snap(page, "06-produce");
  await page.getByRole("link", { name: "التالي: المونتاج" }).click();

  // الخطوة 6: المونتاج
  await page.getByRole("tab", { name: "الصوت" }).click();
  const music = page.getByLabel("الموسيقى", { exact: true });
  await music.selectOption((await music.locator("option", { hasText: "music.mp3" }).getAttribute("value"))!);
  await page.getByRole("tab", { name: "الشعار والمقاس" }).click();
  const logo = page.getByLabel("الشعار", { exact: true });
  await logo.selectOption((await logo.locator("option", { hasText: "logo.png" }).getAttribute("value"))!);
  await expect(page.getByText("حُفظ تلقائيًا")).toBeVisible({ timeout: 10_000 });
  await snap(page, "07-editor");

  // الخطوة 7: التصدير
  await page.getByRole("link", { name: "التصدير" }).last().click();
  await expect(page.getByText("المشروع جاهز للتصدير.")).toBeVisible();
  await page.getByRole("button", { name: "صدّر الفيديو" }).click();
  await expect(page.getByRole("link", { name: "تنزيل" })).toBeVisible({ timeout: 180_000 });
  await snap(page, "08-export");
  const href = await page.getByRole("link", { name: "تنزيل" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("video/mp4");
  expect((await res.body()).length).toBeGreaterThan(500_000);

  // صفحات أخرى في الرحلة
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: "سجل المهام وتكلفة الإنتاج" })).toBeVisible();
  await snap(page, "09-jobs");
  await page.goto("/templates");
  await expect(page.getByText("إعلان مطعم ترندي")).toBeVisible();
  await snap(page, "10-templates");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "خدمات الذكاء الاصطناعي" })).toBeVisible();
  await snap(page, "11-settings");
});

test("لا يصل مستخدم إلى مشروع مستخدم آخر عبر الرابط أو الـ API", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  for (const [p, n] of [[pa, "a"], [pb, "b"]] as const) {
    await p.goto("/signup");
    await p.getByLabel("الاسم").fill(`مستخدم ${n}`);
    await p.getByLabel("البريد الإلكتروني").fill(`e2e-${n}-${Date.now()}@example.com`);
    await p.getByLabel("كلمة المرور").fill("password-1234");
    await p.getByRole("button", { name: "إنشاء الحساب" }).click();
    await p.waitForURL("**/projects/new");
  }
  await pa.getByLabel("اسم النشاط التجاري").fill("سر المستخدم أ");
  await pa.getByRole("button", { name: "متابعة إلى رفع المواد" }).click();
  await pa.waitForURL("**/media");
  const id = pa.url().split("/projects/")[1].split("/")[0];
  const api = await pb.request.get(`/api/projects/${id}`);
  expect(api.status()).toBe(404);
  const patch = await pb.request.patch(`/api/projects/${id}`, { data: { title: "x" }, headers: { origin: "http://localhost:3000" } });
  expect(patch.status()).toBe(404);
  await pb.goto(`/projects/${id}/script`);
  await expect(pb.getByText("تعذّر فتح المشروع")).toBeVisible();
  // طلب معدِّل من أصل مختلف يُرفض (CSRF)
  const csrf = await pa.request.patch(`/api/projects/${id}`, { data: { title: "x" }, headers: { origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
  await a.close();
  await b.close();
});
