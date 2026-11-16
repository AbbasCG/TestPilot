import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Automated WCAG 2.1 A/AA scan (axe-core) of the main screens in light and dark themes.
// It complements, and does not replace, a manual screen-reader review.

const ORIGIN = "http://127.0.0.1:5174";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();
}

async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`${ORIGIN}${path}`, { method, data, headers: { Accept: "application/json", Origin: ORIGIN, "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const detail = (n: (typeof violations)[number]["nodes"][number]) => {
    const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } | undefined;
    return d?.fgColor ? `${n.target.join(" ")} [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}, need ${d.expectedContrastRatio}]` : n.target.join(" ");
  };
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} — ${v.nodes.slice(0, 4).map(detail).join(" | ")}`);
  expect.soft(summary, label).toEqual([]);
}

test("login and invitation screens have no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "تسجيل الدخول", exact: true })).toBeVisible();
  await scan(page, "/login");
});

test("main screens have no WCAG A/AA violations in light and dark themes", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: `فحص الوصول ${Date.now()}` })).data;
  const base = `/api/projects/${project.id}`;
  const members = (await call(page, `${base}/members`, "PUT", { email: "tester@e2e.test", role: "tester" })).data.members as { id: number; email: string }[];
  const environment = (await call(page, `${base}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" })).data;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "Core", position: 0, archived: false })).data;
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === "collaboration");
  const scenario = (await call(page, `${base}/scenarios`, "POST", { ...template.content, suite_id: suite.id, status: "ready" })).data;
  const run = (await call(page, `${base}/runs`, "POST", { title: "جلسة الوصول", build_version: "v1", environment_id: environment.id, suite_id: suite.id, tester_a_id: members.find((m) => m.email === "owner@e2e.test")?.id, tester_b_id: members.find((m) => m.email === "tester@e2e.test")?.id, scenarios: [{ id: scenario.id, version: scenario.version }] })).data;
  const paths = ["/", "/projects", `/projects/${project.id}`, `/projects/${project.id}/tests`, `/projects/${project.id}/tests/${scenario.id}`, `/projects/${project.id}/tests/${scenario.id}/edit`, `/projects/${project.id}/runs`, `/projects/${project.id}/runs/${run.id}`, `/projects/${project.id}/runs/${run.id}?view=all`, `/projects/${project.id}/issues`, `/projects/${project.id}/issues/new`, `/projects/${project.id}/analytics`, `/projects/${project.id}/team`, "/admin/users"];
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main h1, h1").first()).toBeVisible({ timeout: 10_000 });
      // The scan must really run in the requested theme (a lost preference would silently re-test light twice).
      if (theme === "dark") await expect(page.locator(".app")).toHaveAttribute("data-theme", "dark");
      await scan(page, `${path} [${theme}]`);
    }
  }
});
