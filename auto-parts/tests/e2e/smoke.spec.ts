import { expect, test, type Page } from "@playwright/test";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const { path, lang, dir } of [
  { path: "/", lang: "ar", dir: "rtl" },
  { path: "/en", lang: "en", dir: "ltr" },
  { path: "/zh", lang: "zh", dir: "ltr" },
]) {
  test(`home ${lang}: correct lang/dir, no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
  });
}

for (const path of ["/login", "/signup", "/en/login", "/zh/signup"]) {
  test(`${path} renders a usable form without horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await noHorizontalScroll(page);
  });
}

test("account and admin pages redirect visitors to sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fadmin$/);
});

test("an external next= target is replaced with an internal path", async ({ page }) => {
  await page.goto("/login?next=//evil.example/x");
  await expect(page.locator('input[name="next"]')).toHaveValue("/account");
});

test("language switcher changes the URL and the choice sticks", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/login$/);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("wrong credentials show an error from Supabase (no account is created)", async ({ page }) => {
  await page.goto("/en/login");
  await page.fill('input[name="email"]', "zz-nobody-e2e@example.com");
  await page.fill('input[name="password"]', "wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page).toHaveURL(/error=(invalid|rateLimited)/);
  await expect(page.locator("main [role=alert]")).toBeVisible();
});

test.describe("browser language", () => {
  test.use({ locale: "en-US" });
  test("an English browser opening / is sent to /en", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test("forgot-password is linked from sign in; reset-password needs a session", async ({ page }) => {
  await page.goto("/login");
  await page.locator('a[href="/forgot-password"]').click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/login\?next=%2Freset-password$/);
});

test("an email link that lands on the home page goes through /auth/confirm", async ({ page }) => {
  await page.goto("/?code=00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
  await page.goto("/?error=access_denied&error_code=otp_expired");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
});

test("email links carried in the # fragment are handled on any page", async ({ page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=expired");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
  await page.goto("/en#access_token=bad.token.value-that-is-long-enough&refresh_token=bad&type=recovery");
  await expect(page).toHaveURL(/\/en\/login\?error=confirmFailed$/);
  await expect(page.locator("main [role=alert]")).toBeVisible();
});

test("/auth/confirm forwards a # fragment link to the handler", async ({ page }) => {
  await page.goto("/auth/confirm#access_token=bad.token.value-that-is-long-enough&refresh_token=bad&type=recovery");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
  await expect(page.locator("main [role=alert]")).toBeVisible();
});

test("partner and admin partner pages are protected; a bad invite link is explained", async ({ page, request }) => {
  await page.goto("/invite/" + "0".repeat(64));
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("/partner");
  await expect(page).toHaveURL(/\/login\?next=%2Fpartner$/);
  await page.goto("/admin/partner-applications");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  const doc = await request.get("/api/documents/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect(doc.status()).toBe(401);
});

test("catalog: home search goes to /products, which works on mobile; partner products are protected", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[name="q"]', "فلتر");
  await page.locator('form[action="/products"] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/products\?q=/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  const res = await page.goto("/products/00000000-0000-0000-0000-000000000000");
  expect(res?.status()).toBe(404);
  await page.goto("/partner/products");
  await expect(page).toHaveURL(/\/login\?next=%2Fpartner/);
});

test("unknown pages return 404", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("the invalid activation link is rejected", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=signup");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
  await expect(page.locator("main [role=alert]")).toBeVisible();
});

test("quote request, orders, supplier and admin quote pages require sign-in", async ({ page }) => {
  for (const [path, next] of [
    ["/request-part", "%2Frequest-part"],
    ["/account/requests", "%2Faccount%2Frequests"],
    ["/account/orders", "%2Faccount%2Forders"],
    ["/partner/requests", "%2Fpartner"],
    ["/en/admin/quotes", "%2Fadmin"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${next}$`));
  }
});

test("request media requires sign-in", async ({ request }) => {
  const res = await request.get("/api/request-media/00000000-0000-0000-0000-000000000000?request=00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test("the header links to the part request form", async ({ page }) => {
  await page.goto("/products");
  await page.locator('header a[href="/request-part"]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Frequest-part$/);
  await noHorizontalScroll(page);
});

test("carrier, supplier orders and admin operations pages require sign-in", async ({ page }) => {
  for (const [path, next] of [
    ["/carrier", "%2Fcarrier"],
    ["/carrier/shipments/00000000-0000-0000-0000-000000000000", "%2Fcarrier"],
    ["/partner/orders", "%2Fpartner"],
    ["/en/admin/orders", "%2Fadmin"],
    ["/admin/shipping", "%2Fadmin"],
    ["/admin/reports", "%2Fadmin"],
    ["/zh/admin/settings", "%2Fadmin"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${next}$`));
  }
});

test("shipment documents and the orders CSV export require sign-in", async ({ request }) => {
  const doc = await request.get("/api/shipment-documents/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect(doc.status()).toBe(401);
  const csv = await request.get("/api/reports/orders?from=2026-01-01&to=2026-01-31", { maxRedirects: 0 });
  expect(csv.status()).toBe(401);
  const bad = await request.get("/api/reports/orders?from=x&to=y", { maxRedirects: 0 });
  expect(bad.status()).toBe(400);
});

test("security headers are set and no page breaks under the content security policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  const res = await page.goto("/products");
  const headers = res!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-frame-options"]).toBe("DENY");
  for (const path of ["/", "/en/login", "/zh/signup", "/products"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  // تبديل اللغة يعمل عبر Server Action (fetch إلى الموقع نفسه) ولا يُحجب.
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  expect(violations).toEqual([]);
});

test("health endpoint reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(res.status()).toBe(body.db ? 200 : 503);
  expect(body).toHaveProperty("latencyMs");
});

for (const [path, lang] of [["/about", "ar"], ["/en/how-it-works", "en"], ["/zh/faq", "zh"], ["/privacy", "ar"], ["/en/terms", "en"]] as const) {
  test(`trust page ${path} renders with hreflang and no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="zh"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await noHorizontalScroll(page);
  });
}

test("the footer links to the trust pages", async ({ page }) => {
  await page.goto("/");
  await page.locator('footer a[href="/faq"]').click();
  await expect(page).toHaveURL(/\/faq$/);
  await page.locator("details").first().click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
});

test("public tracking validates input and never puts the phone in the URL", async ({ page }) => {
  await page.goto("/track");
  await page.fill('input[name="reference"]', "ORD-1");
  await page.fill('input[name="phone"]', "0501234567");
  await page.getByRole("button", { name: "تتبع" }).click();
  await expect(page.locator("main [role=alert]")).toBeVisible();
  // الحقول تبقى بعد الإرسال؛ تصحيح الرقم فقط يكفي لإعادة المحاولة.
  await expect(page.locator('input[name="phone"]')).toHaveValue("0501234567");
  await page.fill('input[name="reference"]', "ORD-999999");
  await page.getByRole("button", { name: "تتبع" }).click();
  // وصل الطلب لقاعدة البيانات (لم يعد خطأ صيغة): «لم نجد» بعد تطبيق ترحيل التتبع على المشروع.
  await expect(page.locator("main [role=alert]")).not.toContainText("تحقق من رقم الطلب");
  expect(page.url()).not.toContain("0501234567");
  await noHorizontalScroll(page);
});

test("brand pages exist for SEO and unknown brands are 404", async ({ page }) => {
  await page.goto("/brands/chery");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("شيري");
  await page.goto("/en/brands/geely");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Geely");
  const res = await page.goto("/brands/not-a-brand");
  expect(res!.status()).toBe(404);
});

test("sitemap and robots are published", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/brands/chery");
  expect(sitemap).toContain("/en/faq");
  expect(sitemap).toContain('hreflang="zh"');
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Sitemap:");
});
