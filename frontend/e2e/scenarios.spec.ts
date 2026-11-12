import { test, expect } from "@playwright/test";

test("scenario builder saves ordered steps and retains previous revisions", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/login");
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
  await page
    .getByRole("link", { name: "مشروع جديد", exact: true })
    .first()
    .click();
  await page
    .getByLabel("اسم المشروع", { exact: true })
    .fill(`مشروع السيناريو ${Date.now()}`);
  await page.getByRole("button", { name: "متابعة للمراجعة" }).click();
  await page
    .getByRole("button", { name: "إنشاء المشروع", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);
  await page.getByRole("link", { name: "الاختبارات", exact: true }).click();
  await page.getByRole("button", { name: "إنشاء مجموعة" }).click();
  await page
    .getByLabel("اسم المجموعة", { exact: true })
    .fill("اختبارات القبول");
  await page.getByRole("button", { name: "حفظ المجموعة" }).click();
  await expect(
    page.getByRole("button", { name: "تعديل مجموعة اختبارات القبول" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "سيناريو جديد" }).click();
  await page
    .getByRole("combobox", { name: "ابدأ من قالب" })
    .selectOption("collaboration");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "استخدام القالب" }).click();
  await page
    .getByRole("combobox", { name: "المجموعة", exact: true })
    .selectOption({ label: "اختبارات القبول" });
  await page
    .getByRole("combobox", { name: "حالة السيناريو" })
    .selectOption("ready");
  await page
    .getByLabel("عنوان السيناريو", { exact: true })
    .fill("دعوة مشتركة محفوظة");
  await page.screenshot({
    path: "test-results/scenario-builder.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "حفظ السيناريو", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tests\/\d+$/);
  await expect(
    page.getByRole("heading", { name: "دعوة مشتركة محفوظة" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "تحقق من العضوية المشتركة" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "تعديل السيناريو" }).click();
  await page
    .getByLabel("عنوان السيناريو", { exact: true })
    .fill("دعوة مشتركة — النسخة الثانية");
  await page
    .getByRole("button", { name: "حفظ السيناريو", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tests\/\d+$/);
  await page
    .getByRole("combobox", { name: "استعراض نسخة محفوظة" })
    .selectOption("1");
  await expect(
    page.getByRole("heading", { name: "دعوة مشتركة محفوظة", exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
