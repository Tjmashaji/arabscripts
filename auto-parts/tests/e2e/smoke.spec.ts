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

test("unknown pages return 404", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("the invalid activation link is rejected", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=signup");
  await expect(page).toHaveURL(/\/login\?error=confirmFailed$/);
  await expect(page.locator("main [role=alert]")).toBeVisible();
});
