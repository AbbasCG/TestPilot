import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// M8 end-to-end path driven entirely through the UI with two independent accounts:
// project → scenario → testers → run → A/B steps → failure → issue → screenshot →
// fix → independent retest → final assessment → analytics, exports and printable PDF report.

const PASSWORD = "TestPilot-e2e-only-2026";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWNUjjnOgA0wYRUdtBIAApcBVuhaAw8AAAAASUVORK5CYII=", "base64");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
}

async function record(column: Locator, step: number, status: "passed" | "failed", text: string) {
  const card = column.getByRole("article", { name: `نتيجة الخطوة ${step}`, exact: true });
  await card.getByRole("combobox", { name: "نتيجة الخطوة" }).selectOption(status);
  await card.getByRole("textbox", { name: "النتيجة الفعلية", exact: true }).fill(text);
  if (status === "passed") await card.getByLabel("تحققت فعليًا من النتيجة المتوقعة").check();
  await card.getByRole("button", { name: "حفظ نتيجة الخطوة", exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("حُفظت النتيجة");
  return card;
}

async function transition(page: Page, label: string, fill?: () => Promise<void>) {
  const panel = page.getByRole("region", { name: "سير العمل" });
  await panel.getByLabel(label, { exact: true }).check();
  if (fill) await fill();
  await panel.getByRole("button", { name: "تطبيق الانتقال" }).click();
}

test("complete collaborative QA lifecycle ends in a verified report", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const name = `دورة كاملة ${Date.now()}`;

  // 1. Project, environment and team through the UI.
  await login(page, "owner@e2e.test");
  await page.getByRole("link", { name: "مشروع جديد", exact: true }).first().click();
  await page.getByLabel("اسم المشروع", { exact: true }).fill(name);
  await page.getByRole("button", { name: "متابعة للمراجعة" }).click();
  await page.getByRole("button", { name: "إنشاء المشروع", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);
  const projectUrl = new URL(page.url()).pathname;
  await page.getByLabel("اسم البيئة").fill("Staging");
  await page.getByRole("button", { name: "إضافة بيئة" }).click();
  await expect(page.getByText("Staging", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "أعضاء الفريق" }).click();
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("tester@e2e.test");
  await page.getByRole("combobox", { name: "الصلاحية", exact: true }).selectOption("tester");
  await page.getByRole("button", { name: "حفظ العضوية" }).click();
  await expect(page.getByRole("cell", { name: "tester@e2e.test" })).toBeVisible();

  // 2. Suite and a ready scenario from the two-person template.
  await page.getByRole("link", { name: "الاختبارات", exact: true }).click();
  await page.getByRole("button", { name: "إنشاء مجموعة" }).click();
  await page.getByLabel("اسم المجموعة", { exact: true }).fill("الدعوات");
  await page.getByRole("button", { name: "حفظ المجموعة" }).click();
  await page.getByRole("link", { name: "سيناريو جديد" }).click();
  await page.getByRole("combobox", { name: "ابدأ من قالب" }).selectOption("collaboration");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "استخدام القالب" }).click();
  await page.getByRole("combobox", { name: "المجموعة", exact: true }).selectOption({ label: "الدعوات" });
  await page.getByRole("combobox", { name: "حالة السيناريو" }).selectOption("ready");
  await page.getByLabel("عنوان السيناريو", { exact: true }).fill("دعوة معلّم وقبولها");
  await page.getByRole("button", { name: "حفظ السيناريو", exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/\d+$/);

  // 3. Assign Tester A (owner) and Tester B, start the run.
  await page.getByRole("link", { name: "جلسات الاختبار" }).click();
  await page.getByRole("link", { name: "جلسة جديدة" }).click();
  await page.getByLabel("عنوان الجلسة", { exact: true }).fill("اختبار قبول الإصدار");
  await page.getByLabel("إصدار التطبيق المختبَر").fill("v2.0.0");
  await page.getByRole("combobox", { name: "البيئة", exact: true }).selectOption({ label: "Staging" });
  const pick = async (box: string, email: string) => {
    const select = page.getByRole("combobox", { name: box, exact: true });
    await select.selectOption((await select.locator("option", { hasText: email }).getAttribute("value"))!);
  };
  await pick("Tester A", "owner@e2e.test");
  await pick("Tester B", "tester@e2e.test");
  await page.getByRole("checkbox", { name: /دعوة معلّم وقبولها/ }).check();
  await page.getByRole("button", { name: "بدء الجلسة", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/\d+$/);
  const runUrl = new URL(page.url()).pathname;

  // 4. Tester A passes steps 1–2; Tester B records a failure on step 3 in a separate session.
  const colA = page.getByRole("region", { name: "خطوات Tester A", exact: true });
  await record(colA, 1, "passed", "أُرسلت الدعوة بالدور المتوقع");
  await record(colA, 2, "passed", "ظهرت الدعوة في قائمة المعلّقة");
  const second = await browser.newContext();
  const tester = await second.newPage();
  tester.on("pageerror", (e) => errors.push(e.message));
  await login(tester, "tester@e2e.test");
  await tester.goto(runUrl);
  const colB = tester.getByRole("region", { name: "خطوات Tester B", exact: true });
  const failed = await record(colB, 3, "failed", "رسالة خطأ 500 عند قبول الدعوة");

  // 5. Tester B creates the issue from the failed result and attaches a screenshot.
  await failed.getByRole("link", { name: "إنشاء مشكلة من هذه النتيجة" }).click();
  await expect(tester).toHaveURL(/\/issues\/new\?/);
  await expect(tester.getByRole("heading", { name: "تسجيل مشكلة" })).toBeVisible();
  await expect(tester.getByRole("textbox", { name: "النتيجة الفعلية", exact: true })).toHaveValue("رسالة خطأ 500 عند قبول الدعوة");
  await tester.getByRole("textbox", { name: "الوصف", exact: true }).fill("قبول دعوة المعلّم يعيد خطأ خادم.");
  await tester.getByRole("combobox", { name: "الخطورة" }).selectOption("blocker");
  await tester.getByRole("combobox", { name: "الأولوية" }).selectOption("urgent");
  await tester.getByRole("button", { name: "إنشاء المشكلة" }).click();
  await expect(tester).toHaveURL(/\/issues\/\d+$/);
  const issuePath = new URL(tester.url()).pathname;
  await tester.getByLabel("الملف", { exact: true }).setInputFiles({ name: "accept-500.png", mimeType: "image/png", buffer: PNG });
  await tester.getByRole("button", { name: "رفع الدليل" }).click();
  await expect(tester.getByRole("img", { name: "لقطة شاشة: accept-500.png" })).toBeVisible();

  // 6. Owner triages, fixes (simulated) and sends for retest to Tester B.
  await page.goto(issuePath);
  await transition(page, "اعتماد الفرز");
  await expect(page.locator(".issue-badges").getByText("مفروزة")).toBeVisible();
  await transition(page, "إسناد للإصلاح", () => page.getByRole("combobox", { name: "المكلَّف بالإصلاح" }).selectOption({ label: "مدير الجودة" }));
  await expect(page.locator(".issue-badges").getByText("مُسندة")).toBeVisible();
  await transition(page, "بدء الإصلاح");
  await expect(page.locator(".issue-badges").getByText("قيد الإصلاح")).toBeVisible();
  await transition(page, "إرسال لإعادة الاختبار", async () => {
    await page.getByLabel("إصدار البناء الذي يحتوي الإصلاح").fill("v2.0.1");
    await page.getByRole("textbox", { name: "وصف الإصلاح", exact: true }).fill("إصلاح تجريبي: معالجة الدعوة المنتهية");
  });
  await expect(page.locator(".issue-badges").getByText("جاهزة لإعادة الاختبار")).toBeVisible();

  // 7. Tester B retests v2.0.1 with evidence; the issue becomes verified. Owner closes it.
  await tester.goto(issuePath);
  await tester.getByRole("link", { name: "تنفيذ إعادة الاختبار" }).click();
  await expect(tester.getByRole("heading", { name: "إعادة الاختبار — المحاولة 1" })).toBeVisible();
  await tester.getByLabel("الملف", { exact: true }).setInputFiles({ name: "accept-ok.png", mimeType: "image/png", buffer: PNG });
  await tester.getByRole("button", { name: "رفع الدليل" }).click();
  await expect(tester.getByRole("img", { name: "لقطة شاشة: accept-ok.png" })).toBeVisible();
  await tester.getByRole("textbox", { name: "النتيجة الفعلية", exact: true }).fill("قُبلت الدعوة وظهرت المؤسسة على v2.0.1");
  await tester.getByLabel(/نفّذت الخطوات فعليًا/).check();
  await tester.getByRole("button", { name: "حفظ نتيجة إعادة الاختبار" }).click();
  await expect(tester.locator(".issue-badges").getByText("متحقَّق من إصلاحها")).toBeVisible();
  await page.reload();
  await transition(page, "إغلاق المشكلة");
  await expect(page.locator(".issue-badges").getByText("مغلقة")).toBeVisible();

  // 8. The original run keeps its failure; the owner records the explicit final assessment.
  await page.goto(runUrl);
  await expect(page.getByRole("link", { name: /مشكلة مرتبطة · مغلقة/ })).toBeVisible();
  await page.getByRole("combobox", { name: "التقييم النهائي" }).selectOption("failed");
  await page.getByLabel("خلاصة التحقق").fill("فشل قبول الدعوة على v2.0.0 وأُصلح وتحقق منه بإعادة اختبار مستقلة على v2.0.1.");
  await page.getByRole("button", { name: "اعتماد التقييم النهائي" }).click();
  await expect(page.locator(".final-assessment").getByText("فاشلة", { exact: true })).toBeVisible();

  // 9. Analytics, exports and the printable Arabic report.
  await page.goto(`${projectUrl}/analytics`);
  await expect(page.locator(".kpi").filter({ hasText: "نسبة النجاح" })).toContainText("66.7%");
  await expect(page.locator(".kpi").filter({ hasText: "إعادة الاختبار" })).toContainText("1 / 0");
  await expect(page.getByRole("region", { name: /جاهزية الإصدار/ })).toContainText("غير جاهز");
  await expect(page.getByRole("img", { name: /نتائج مسجلة يوميًا: 3 نتيجة/ })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Markdown" }).click();
  const markdown = await readFile((await (await download).path())!, "utf8");
  expect(markdown).toContain(`# تقرير جودة: ${name}`);
  expect(markdown).toContain("| اختبار قبول الإصدار | v2.0.0 | منتهية | فاشلة | 2 | 1 | 0 | 66.7% |");
  await page.screenshot({ path: "test-results/analytics.png", fullPage: true });
  await page.getByRole("link", { name: /تقرير قابل للطباعة/ }).click();
  await expect(page.locator(".print-report").getByRole("heading", { name, level: 2 })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.screenshot({ path: "test-results/final-report-print.png", fullPage: true });
  await page.pdf({ path: "test-results/final-report.pdf", format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "مقارنة المشاريع" })).toBeVisible();
  await expect(page.getByRole("link", { name, exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
  await second.close();
});
