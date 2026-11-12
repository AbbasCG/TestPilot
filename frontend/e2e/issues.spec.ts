import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// 8x8 opaque PNG generated for the test; real image bytes so the server-side re-encoder accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWNUjjnOgA0wYRUdtBIAApcBVuhaAw8AAAAASUVORK5CYII=",
  "base64",
);

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
}

async function call(page: Page, path: string, method = "GET", body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`http://127.0.0.1:5174${path}`, {
    method,
    data: body,
    headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174", "X-XSRF-TOKEN": decodeURIComponent(csrf) },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.status() === 204 ? null : response.json();
}

async function transition(page: Page, label: string, fill?: () => Promise<void>) {
  const panel = page.getByRole("region", { name: "سير العمل" });
  await panel.getByLabel(label, { exact: true }).check();
  if (fill) await fill();
  await panel.getByRole("button", { name: "تطبيق الانتقال" }).click();
}

test("failed step becomes an issue with private evidence, fix, independent retest and closure", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: `مشكلات ${Date.now()}` })).data;
  const base = `/api/projects/${project.id}`;
  const members = (await call(page, `${base}/members`, "PUT", { email: "tester@e2e.test", role: "tester" })).data.members as { id: number; email: string }[];
  const owner = members.find((m) => m.email === "owner@e2e.test")!.id;
  const testerId = members.find((m) => m.email === "tester@e2e.test")!.id;
  const environment = (await call(page, `${base}/environments`, "POST", { name: "Staging" })).data;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "الدعوات", position: 0, archived: false })).data;
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === "collaboration");
  const scenario = (await call(page, `${base}/scenarios`, "POST", { ...template.content, suite_id: suite.id, status: "ready", title: "دعوة معلّم" })).data;
  const run = (await call(page, `${base}/runs`, "POST", { title: "جلسة اكتشاف الخلل", build_version: "v1.0.0", environment_id: environment.id, suite_id: suite.id, tester_a_id: owner, tester_b_id: testerId, scenarios: [{ id: scenario.id, version: 1 }] })).data;

  // Tester A records a real failure in the collaborative runner.
  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  const card = page.getByRole("region", { name: "خطوات Tester A", exact: true }).getByRole("article", { name: "نتيجة الخطوة 1", exact: true });
  await card.getByRole("combobox", { name: "نتيجة الخطوة" }).selectOption("failed");
  await card.getByRole("textbox", { name: "النتيجة الفعلية", exact: true }).fill("زر إرسال الدعوة لا يستجيب ولا تظهر رسالة");
  await card.getByRole("button", { name: "حفظ نتيجة الخطوة", exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("حُفظت النتيجة");
  await card.getByRole("link", { name: "إنشاء مشكلة من هذه النتيجة" }).click();

  // The issue form is prefilled from the frozen run snapshot.
  await expect(page.getByRole("textbox", { name: "النتيجة الفعلية", exact: true })).toHaveValue("زر إرسال الدعوة لا يستجيب ولا تظهر رسالة");
  await expect(page.getByRole("textbox", { name: "خطوات إعادة الإنتاج", exact: true })).toHaveValue(/دعوة معلّم/);
  await page.getByRole("textbox", { name: "الوصف", exact: true }).fill("لا يمكن دعوة معلّم إلى المؤسسة من شاشة الدعوات.");
  await page.getByRole("combobox", { name: "الخطورة" }).selectOption("critical");
  await page.getByRole("button", { name: "إنشاء المشكلة" }).click();
  await expect(page).toHaveURL(/\/issues\/\d+$/);
  const issueUrl = page.url();
  await expect(page.locator(".issue-badges").getByText("جديدة")).toBeVisible();
  await expect(page.locator(".issue-badges").getByText("حرجة")).toBeVisible();

  // Private screenshot upload, rendered only through the authorized endpoint.
  await page.getByRole("combobox", { name: "نوع الدليل" }).selectOption("screenshot");
  await page.getByLabel("الملف", { exact: true }).setInputFiles({ name: "send-invite.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "رفع الدليل" }).click();
  const shot = page.getByRole("img", { name: "لقطة شاشة: send-invite.png" });
  await expect(shot).toBeVisible();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(8);

  // Owner triages, assigns themself, fixes and requests an independent retest.
  await transition(page, "اعتماد الفرز");
  await expect(page.locator(".issue-badges").getByText("مفروزة")).toBeVisible();
  await transition(page, "إسناد للإصلاح", () => page.getByRole("combobox", { name: "المكلَّف بالإصلاح" }).selectOption(String(owner)));
  await expect(page.locator(".issue-badges").getByText("مُسندة")).toBeVisible();
  await transition(page, "بدء الإصلاح");
  await expect(page.locator(".issue-badges").getByText("قيد الإصلاح")).toBeVisible();
  await transition(page, "إرسال لإعادة الاختبار", async () => {
    await page.getByLabel("إصدار البناء الذي يحتوي الإصلاح").fill("v1.0.1");
    await expect(page.getByRole("combobox", { name: "المختبر الذي سيعيد الاختبار" })).toHaveValue(String(testerId));
    await page.getByRole("textbox", { name: "وصف الإصلاح", exact: true }).fill("إصلاح معالج النقر وإضافة رسالة نجاح");
  });
  await expect(page.locator(".issue-badges").getByText("جاهزة لإعادة الاختبار")).toBeVisible();
  await expect(page.getByRole("link", { name: "تنفيذ إعادة الاختبار" })).toHaveCount(0);

  // Tester B performs the retest in an independent session.
  const second = await browser.newContext();
  const tester = await second.newPage();
  tester.on("pageerror", (e) => errors.push(e.message));
  await login(tester, "tester@e2e.test");
  await tester.goto(`/projects/${project.id}/issues`);
  await expect(tester.getByRole("heading", { name: "إعادة اختبار مطلوبة منك" })).toBeVisible();
  await tester.goto(issueUrl);
  await tester.getByRole("link", { name: "تنفيذ إعادة الاختبار" }).click();
  await expect(tester.getByRole("heading", { name: "إعادة الاختبار — المحاولة 1" })).toBeVisible();
  await tester.getByLabel("الملف", { exact: true }).setInputFiles({ name: "retest-pass.png", mimeType: "image/png", buffer: PNG });
  await tester.getByRole("button", { name: "رفع الدليل" }).click();
  await expect(tester.getByRole("img", { name: "لقطة شاشة: retest-pass.png" })).toBeVisible();
  await tester.getByRole("textbox", { name: "النتيجة الفعلية", exact: true }).fill("أُرسلت الدعوة وظهرت رسالة النجاح على v1.0.1");
  await expect(tester.getByRole("button", { name: "حفظ نتيجة إعادة الاختبار" })).toBeDisabled();
  await tester.getByLabel(/نفّذت الخطوات فعليًا/).check();
  await tester.getByRole("button", { name: "حفظ نتيجة إعادة الاختبار" }).click();
  await expect(tester).toHaveURL(/\/issues\/\d+$/);
  await expect(tester.locator(".issue-badges").getByText("متحقَّق من إصلاحها")).toBeVisible();

  // Owner closes; history retains the original failure, retest and evidence.
  await page.reload();
  await transition(page, "إغلاق المشكلة");
  await expect(page.locator(".issue-badges").getByText("مغلقة")).toBeVisible();
  await expect(page.locator(".retest-passed")).toContainText("المحاولة 1");
  await expect(page.getByRole("region", { name: "السجل الزمني" })).toContainText("سجّل نتيجة إعادة الاختبار");
  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(page.getByRole("link", { name: /مشكلة مرتبطة · مغلقة/ })).toBeVisible();
  await expect(card.locator(".result-badge.failed")).toBeVisible();

  await page.goto(issueUrl);
  await expect(page.getByRole("heading", { name: "محاولات إعادة الاختبار" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/issue-detail-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${project.id}/issues`);
  await expect(page.getByRole("link", { name: /لا يستجيب|فشل:/ })).toBeVisible();
  await page.screenshot({ path: "test-results/issues-dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
  await second.close();
});
