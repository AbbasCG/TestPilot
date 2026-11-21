import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// «عملي»: each user sees their own sessions (with remaining steps) and the issues assigned to them, across projects.
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

test("my work lists the user's own session progress and assigned issues, and opens them", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const tag = Date.now().toString(36);
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: `عملي ${tag}` })).data;
  await call(page, `/api/projects/${project.id}/members`, "PUT", { email: "tester@e2e.test", role: "tester" });
  const environment = (await call(page, `/api/projects/${project.id}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" })).data;

  // Setup goes through the API only, so no dialog can be left open over the navigation clicked below.
  const suite = (await call(page, `/api/projects/${project.id}/suites`, "POST", { name: "مجموعة", position: 0, archived: false })).data;
  const template = (await call(page, `/api/projects/${project.id}/scenario-templates`)).data.find((t: { id: string }) => t.id === "login");
  const ready = (await call(page, `/api/projects/${project.id}/scenarios`, "POST", { ...template.content, title: `مسار عملي ${tag}`, suite_id: suite.id, status: "ready" })).data;
  const members = (await call(page, `/api/projects/${project.id}`)).data.members as { id: number; email: string }[];
  const owner = members.find((m) => m.email === "owner@e2e.test")!.id;
  const tester = members.find((m) => m.email === "tester@e2e.test")!.id;
  const runTitle = `جلسة عملي ${tag}`;
  const run = (await call(page, `/api/projects/${project.id}/runs`, "POST", { title: runTitle, build_version: "v7", environment_id: environment.id, tester_a_id: owner, tester_b_id: tester, scenarios: [{ id: ready.id, version: ready.version }] })).data;

  const issueTitle = `مشكلة لعملي ${tag}`;
  let issue = (await call(page, `/api/projects/${project.id}/issues`, "POST", {
    title: issueTitle, description: "وصف المشكلة", reproduction_steps: "1. افتح الصفحة", expected_result: "تعمل", actual_result: "لا تعمل", severity: "critical", priority: "high",
  })).data;
  issue = (await call(page, `/api/projects/${project.id}/issues/${issue.id}/transition`, "POST", { to: "triaged", version: issue.version })).data;
  await call(page, `/api/projects/${project.id}/issues/${issue.id}/transition`, "POST", { to: "assigned", version: issue.version, assignee_id: tester });

  // Owner (Tester A) owns all three steps: the session shows 3 remaining; the issue is not theirs.
  await page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "عملي" }).click();
  await expect(page.getByRole("heading", { name: "عملي", level: 1 })).toBeVisible();
  const runs = page.getByRole("region", { name: /جلساتي الجارية/ });
  const runLink = runs.getByRole("link", { name: new RegExp(runTitle) });
  await expect(runLink).toContainText("3 متبقية من 3");
  await expect(runLink).toContainText("Tester A");
  await expect(runLink.getByRole("progressbar", { name: "أنجزت 0 من 3 خطوة" })).toBeVisible();
  await expect(page.getByRole("region", { name: /مشكلات مسندة إليّ/ }).getByText(issueTitle)).toHaveCount(0);
  await runLink.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/runs/${run.id}$`));
  await expect(page.getByText("الخطوة 1 من 3", { exact: true })).toBeVisible();

  // Tester B has no steps here (finished) and owns the assigned issue.
  const other = await browser.newContext();
  const second = await other.newPage();
  await login(second, "tester@e2e.test");
  await second.goto("/my-work");
  await expect(second.getByRole("region", { name: /جلساتي الجارية/ }).getByRole("link", { name: new RegExp(runTitle) })).toContainText("بانتظار الإغلاق");
  const issueLink = second.getByRole("region", { name: /مشكلات مسندة إليّ/ }).getByRole("link", { name: new RegExp(issueTitle) });
  await expect(issueLink).toContainText("حرجة");
  await issueLink.click();
  await expect(second).toHaveURL(new RegExp(`/projects/${project.id}/issues/${issue.id}$`));
  await other.close();
});
