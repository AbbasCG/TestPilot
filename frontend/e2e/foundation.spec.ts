import { test, expect } from "@playwright/test";

test("real session, project wizard, environment, membership, persistence and logout", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("owner@e2e.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "نظرة واضحة على الجودة" }),
  ).toBeVisible();
  const name = `اختبار المتصفح ${Date.now()}`;
  await page
    .getByRole("link", { name: "مشروع جديد", exact: true })
    .first()
    .click();
  await page.getByLabel("اسم المشروع", { exact: true }).fill(name);
  await page
    .getByLabel("وصف المشروع")
    .fill("مشروع تحقق آلي محفوظ في قاعدة الاختبارات المستقلة");
  await page.getByRole("button", { name: "متابعة للمراجعة" }).click();
  await page
    .getByRole("button", { name: "إنشاء المشروع", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects\/\d+$/);
  const projectUrl = page.url();
  await page.getByLabel("اسم البيئة").fill("التجربة");
  await page.getByLabel("عنوان البيئة (اختياري)").fill("https://example.com");
  await page.getByRole("button", { name: "إضافة بيئة" }).click();
  await expect(
    page.getByRole("link", { name: "https://example.com" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "أعضاء الفريق" }).click();
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("tester@e2e.test");
  await page
    .getByRole("combobox", { name: "الصلاحية", exact: true })
    .selectOption("tester");
  await page.getByRole("button", { name: "حفظ العضوية" }).click();
  await expect(
    page.getByRole("cell", { name: "tester@e2e.test" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "tester@e2e.test" }),
  ).toBeVisible();
  const second = await browser.newContext();
  const tester = await second.newPage();
  await tester.goto("http://127.0.0.1:5174/login");
  await tester
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("tester@e2e.test");
  await tester
    .getByLabel("كلمة المرور", { exact: true })
    .fill("TestPilot-e2e-only-2026");
  await tester
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .click();
  await expect(
    tester.getByRole("heading", { name: "نظرة واضحة على الجودة" }),
  ).toBeVisible();
  await tester.goto(projectUrl);
  await expect(
    tester.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await expect(tester.getByRole("button", { name: "إضافة بيئة" })).toHaveCount(
    0,
  );
  await second.close();
  await page.goto("/");
  await expect(page.getByRole("link", { name: `فتح ${name}` })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("link", { name: "المشاريع", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("unsafe request without CSRF proof is rejected", async ({ request }) => {
  await request.get("/sanctum/csrf-cookie");
  const response = await request.post("/api/login", {
    headers: { Origin: "http://127.0.0.1:5174", Accept: "application/json" },
    data: { email: "owner@e2e.test", password: "TestPilot-e2e-only-2026" },
  });
  expect(response.status()).toBe(419);
});
