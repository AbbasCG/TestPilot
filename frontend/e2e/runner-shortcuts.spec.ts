import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Keyboard shortcuts of the guided runner: 1/2/3 (or P/F/B) choose the result, Ctrl+Enter saves and moves on.
const ORIGIN = "http://127.0.0.1:5174";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible({ timeout: 15_000 });
}
async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`${ORIGIN}${path}`, { method, data, headers: { Accept: "application/json", Origin: ORIGIN, "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
const steps = Array.from({ length: 3 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  type: i === 0 ? "navigate" : "verify", title: `خطوة الاختصار ${i + 1}`, assigned_role: "A", url: "", target: "", value: "",
  expected_result: `النتيجة المتوقعة ${i + 1}`, instructions: "", checkpoint: "", evidence_required: false, depends_on: [],
}));

test("guided runner is fully operable from the keyboard with layout-independent shortcuts", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: `اختصارات ${Date.now().toString(36)}` })).data;
  const base = `/api/projects/${project.id}`;
  const environment = (await call(page, `${base}/environments`, "POST", { name: "Staging" })).data;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "Core", position: 0, archived: false })).data;
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id !== "collaboration");
  const scenario = (await call(page, `${base}/scenarios`, "POST", { ...template.content, title: "سيناريو الاختصارات", steps, suite_id: suite.id, status: "ready" })).data;
  const owner = ((await call(page, base)).data.members as { id: number; email: string }[]).find((m) => m.email === "owner@e2e.test")!.id;
  const run = (await call(page, `${base}/runs`, "POST", { mode: "solo", title: "جلسة الاختصارات", build_version: "v1", environment_id: environment.id, suite_id: suite.id, tester_a_id: owner, scenarios: [{ id: scenario.id, version: scenario.version }] })).data;

  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(page.getByText("الخطوة 1 من 3", { exact: true })).toBeVisible();
  await expect(page.locator(".shortcut-hint")).toContainText("Ctrl");
  await page.screenshot({ path: "test-results/runner-shortcuts.png" });
  const radio = (name: string) => page.getByRole("radio", { name });

  // 1 = passed, Ctrl+Enter saves and advances.
  await page.getByRole("radio", { name: "فشلت" }).check();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("1");
  await expect(radio("نجحت")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("الخطوة 2 من 3", { exact: true })).toBeVisible();

  // 2 = failed and the cursor moves into the description; typing digits there never changes the result.
  await page.keyboard.press("2");
  await expect(radio("فشلت")).toBeChecked();
  const description = page.getByRole("textbox", { name: "ماذا حدث؟" });
  await expect(description).toBeFocused();
  await page.keyboard.type("ظهر الخطأ 1 ثم 3");
  await expect(radio("فشلت")).toBeChecked();
  await expect(description).toHaveValue("ظهر الخطأ 1 ثم 3");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("الخطوة 3 من 3", { exact: true })).toBeVisible();

  // Physical key B (whatever the layout prints) = blocked; Ctrl+Enter respects the disabled save while the description is empty.
  await page.keyboard.press("KeyB");
  await expect(radio("تعذّر التنفيذ")).toBeChecked();
  await expect(description).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("الخطوة 3 من 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "حفظ النتيجة" })).toBeDisabled();

  const saved = (await call(page, `${base}/runs/${run.id}`)).data.results as { step_key: string; status: string; actual_result: string | null }[];
  expect(saved.map((r) => r.status)).toEqual(["passed", "failed", "pending"]);
  expect(saved[1].actual_result).toBe("ظهر الخطأ 1 ثم 3");
});
