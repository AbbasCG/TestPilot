import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Scenario library bulk actions: select rows, change status, move suite, start a session with the ready ones.
const PASSWORD = "TestPilot-e2e-only-2026";
const ORIGIN = "http://127.0.0.1:5174";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/", { timeout: 15_000 });
}
async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`${ORIGIN}${path}`, { method, data, headers: { Accept: "application/json", Origin: ORIGIN, "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("library bulk actions change status and suite together and start a session with the ready ones", async ({ page }) => {
  test.setTimeout(90_000);
  const tag = Date.now().toString(36);
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: `جماعي ${tag}` })).data;
  const base = `/api/projects/${project.id}`;
  await call(page, `${base}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" });
  const first = (await call(page, `${base}/suites`, "POST", { name: "الأساسية", position: 0, archived: false })).data;
  await call(page, `${base}/suites`, "POST", { name: "الانحدار", position: 1, archived: false });
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === "login");
  for (const title of ["سيناريو أ", "سيناريو ب", "سيناريو ج"]) {
    await call(page, `${base}/scenarios`, "POST", { ...template.content, title, suite_id: first.id, status: "draft" });
  }

  await page.goto(`/projects/${project.id}/tests`);
  const row = (title: string) => page.getByRole("row", { name: new RegExp(title) });
  await page.getByRole("checkbox", { name: "تحديد سيناريو أ" }).check();
  await page.getByRole("checkbox", { name: "تحديد سيناريو ب" }).check();
  const bar = page.getByRole("region", { name: "إجراءات على السيناريوهات المحددة" });
  await expect(bar).toContainText("2 محدد");
  await expect(bar).toContainText("لبدء جلسة اختر سيناريوهات جاهزة.");
  await expect(page.getByRole("checkbox", { name: "تحديد كل سيناريوهات هذه الصفحة" })).toHaveJSProperty("indeterminate", true);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await bar.getByRole("button", { name: "اجعلها جاهزة" }).click();
  await expect(page.getByRole("status").filter({ hasText: "حُدّث 2 سيناريو." })).toBeVisible();
  await expect(bar).toHaveCount(0);
  await expect(row("سيناريو أ")).toContainText("جاهز للاختبار");
  await expect(row("سيناريو ب")).toContainText("v2");
  await expect(row("سيناريو ج")).toContainText("مسودة");

  await page.getByRole("checkbox", { name: "تحديد كل سيناريوهات هذه الصفحة" }).check();
  await expect(bar).toContainText("3 محدد");
  await bar.getByLabel("المجموعة الهدف").selectOption({ label: "الانحدار" });
  await bar.getByRole("button", { name: "نقل" }).click();
  await expect(page.getByRole("status").filter({ hasText: "نُقل 3 سيناريو." })).toBeVisible();
  for (const title of ["سيناريو أ", "سيناريو ب", "سيناريو ج"]) await expect(row(title)).toContainText("الانحدار");

  await page.getByRole("checkbox", { name: "تحديد كل سيناريوهات هذه الصفحة" }).check();
  await bar.getByRole("link", { name: "ابدأ جلسة بالجاهزة (2)" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/runs/new\\?scenarios=`));
  const picks = page.getByRole("group", { name: /اختر السيناريوهات الجاهزة/ });
  await expect(picks).toContainText("2 محدد");
  await expect(picks.getByRole("checkbox", { name: /سيناريو أ/ })).toBeChecked();
  await expect(picks.getByRole("checkbox", { name: /سيناريو ب/ })).toBeChecked();
});
