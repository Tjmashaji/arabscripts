// المسار المجاني من الواجهة: بلا مفاتيح وبلا محاكاة (ALLOW_SIMULATION=false).
// يتطلب تشغيل التطبيق بهذا الإعداد، وشبكة للصوت المجاني. التشغيل: E2E_FREE=1 npm run test:e2e
import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test.skip(!process.env.E2E_FREE, "يتطلب تطبيقًا يعمل بـ ALLOW_SIMULATION=false (E2E_FREE=1)");

test("إعلان حقيقي مجاني: نص المستخدم ومواده وصوت مجاني", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("الاسم").fill("صاحب مطعم");
  await page.getByLabel("البريد الإلكتروني").fill(`free-${Date.now()}@example.com`);
  await page.getByLabel("كلمة المرور").fill("password-1234");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();

  await page.getByLabel("اسم النشاط التجاري").fill("مطعم الجمر");
  await page.getByRole("radio", { name: "المطاعم والمقاهي" }).click();
  await page.getByRole("button", { name: "متابعة إلى رفع المواد" }).click();
  for (const [role, file] of [["place", "clip.mp4"], ["product", "photo.jpg"]] as const) {
    await page.getByLabel("نوع المادة").selectOption(role);
    await page.getByLabel("اختيار ملفات للرفع").setInputFiles(fixture(file).path);
    await expect(page.locator("li", { hasText: file }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "التالي: الإعداد والفكرة" }).click();

  await page.getByLabel("المدة (ثانية)").selectOption("15");
  await page.getByRole("radio", { name: /لدي فكرة جاهزة/ }).click();
  await page.getByLabel("فكرتك أو السيناريو").fill("جوعان؟ عندنا المندي على أصوله. لحم طري ورز مبهّر. [اسم المطعم] بانتظارك اليوم.");
  await page.getByRole("button", { name: "ولّد السيناريو والمشاهد" }).click();
  await page.getByRole("link", { name: "افتح السيناريو والمشاهد" }).click({ timeout: 60_000 });
  await expect(page.getByText("المجموع 15 ث من 15 ث")).toBeVisible();
  await page.getByRole("link", { name: "التالي: التوليد والصوت" }).click();

  await expect(page.getByText(/صوت مجاني من أصوات Microsoft/)).toBeVisible();
  const selects = page.getByLabel("استخدم مادة من مكتبتك");
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    await s.selectOption((await s.locator("option", { hasText: i % 2 ? "photo.jpg" : "clip.mp4" }).first().getAttribute("value"))!);
  }
  await page.getByRole("button", { name: "ولّد للكل" }).click();
  await expect(page.locator("audio[src]").first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("link", { name: "التصدير" }).last().click();
  await expect(page.getByText("المشروع جاهز للتصدير.")).toBeVisible();
  await page.getByRole("button", { name: "صدّر الفيديو" }).click();
  await expect(page.getByRole("link", { name: "تنزيل" })).toBeVisible({ timeout: 180_000 });
  const res = await page.request.get((await page.getByRole("link", { name: "تنزيل" }).getAttribute("href"))!);
  expect(res.headers()["content-type"]).toBe("video/mp4");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/free-export.png`, fullPage: true });

  await page.goto("/settings");
  await expect(page.getByText("مجاني").first()).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/free-settings.png`, fullPage: true });
});
