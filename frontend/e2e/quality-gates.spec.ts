import { test, expect } from "@playwright/test";
import type { APIResponse, Page } from "@playwright/test";

// M8 gates over real HTTP: concurrency, evidence security, CSRF/auth, and an
// accessibility / RTL / responsive / dark-mode sweep of the main screens.

const ORIGIN = "http://127.0.0.1:5174";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWNUjjnOgA0wYRUdtBIAApcBVuhaAw8AAAAASUVORK5CYII=", "base64");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
}

async function headers(page: Page) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  return { Accept: "application/json", Origin: ORIGIN, "X-XSRF-TOKEN": decodeURIComponent(csrf) };
}

async function raw(page: Page, path: string, method = "GET", data?: unknown): Promise<APIResponse> {
  return page.request.fetch(`${ORIGIN}${path}`, { method, data, headers: await headers(page) });
}

async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const response = await raw(page, path, method, data);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.status() === 204 ? null : response.json();
}

const issue = (title: string) => ({ title, description: "وصف مشكلة اختبار", reproduction_steps: "1. افتح\n2. اضغط", expected_result: "ينجح", actual_result: "يفشل", severity: "major", priority: "high" });

async function seedProject(page: Page) {
  const project = (await call(page, "/api/projects", "POST", { name: `بوابات الجودة ${Date.now()}` })).data;
  const base = `/api/projects/${project.id}`;
  const members = (await call(page, `${base}/members`, "PUT", { email: "tester@e2e.test", role: "tester" })).data.members as { id: number; email: string }[];
  const environment = (await call(page, `${base}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" })).data;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "Core", position: 0, archived: false })).data;
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === "collaboration");
  const scenario = (await call(page, `${base}/scenarios`, "POST", { ...template.content, suite_id: suite.id, status: "ready" })).data;
  const run = (await call(page, `${base}/runs`, "POST", { title: "جلسة البوابات", build_version: "v3.0.0", environment_id: environment.id, suite_id: suite.id, tester_a_id: members.find((m) => m.email === "owner@e2e.test")!.id, tester_b_id: members.find((m) => m.email === "tester@e2e.test")!.id, scenarios: [{ id: scenario.id, version: 1 }] })).data;
  const first = run.results[0];
  await call(page, `${base}/runs/${run.id}/results/${first.id}`, "PUT", { version: 0, status: "failed", actual_result: "ظهر خطأ غير متوقع", verified: false });
  const created = (await call(page, `${base}/issues`, "POST", { ...issue("مشكلة من نتيجة فاشلة"), step_result_id: first.id })).data;
  return { project, base, run, scenario, issue: created };
}

test("concurrent writes keep numbering unique and reject stale transitions", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const { base } = await seedProject(page);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => raw(page, `${base}/issues`, "POST", issue(`متزامنة ${i}`))));
  expect(responses.map((r) => r.status())).toEqual(Array(12).fill(201));
  const numbers = (await Promise.all(responses.map((r) => r.json()))).map((r) => r.data.number).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 2));
  const target = (await responses[0].json()).data;
  const moves = await Promise.all(Array.from({ length: 5 }, () => raw(page, `${base}/issues/${target.id}/transition`, "POST", { to: "triaged", version: target.version })));
  const statuses = moves.map((r) => r.status()).sort();
  expect(statuses.filter((s) => s === 200)).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(4);
  const final = (await call(page, `${base}/issues/${target.id}`)).data;
  expect(final.activities.filter((a: { event: string }) => a.event === "status_changed")).toHaveLength(1);
});

test("evidence is private, type-checked and isolated over HTTP", async ({ page, browser }) => {
  await login(page, "owner@e2e.test");
  const { base, issue: created } = await seedProject(page);
  const upload = (name: string, mimeType: string, buffer: Buffer, kind = "screenshot") =>
    headers(page).then((h) => page.request.fetch(`${ORIGIN}${base}/evidence`, { method: "POST", headers: h, multipart: { kind, issue_id: String(created.id), file: { name, mimeType, buffer } } }));

  const ok = await upload("../../evil\".png", "image/png", PNG);
  expect(ok.status(), await ok.text()).toBe(201);
  const file = (await ok.json()).data;
  expect(file.original_name).toMatch(/^evil[\w -]*\.png$/);
  expect((await upload("page.png", "image/png", Buffer.from("<html><script>alert(1)</script></html>"))).status()).toBe(422);
  expect((await upload("x.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).status()).toBe(422);
  expect((await upload("x.html", "text/plain", Buffer.from("<!doctype html><p>x"), "attachment")).status()).toBe(422);

  const download = await raw(page, `${base}/evidence/${file.id}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment/);
  expect(download.headers()["x-content-type-options"]).toBe("nosniff");
  expect(download.headers()["content-security-policy"]).toContain("sandbox");
  expect(download.headers()["cache-control"]).toContain("no-store");
  for (const guess of ["/storage/evidence", `/storage/app/private/evidence/${created.project_id}`, "/evidence"]) {
    const response = await page.request.get(`${ORIGIN}${guess}`);
    expect((await response.body()).includes(PNG.subarray(0, 8))).toBeFalsy();
  }

  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`${ORIGIN}${base}/evidence/${file.id}`, { headers: { Accept: "application/json" } })).status()).toBe(401);
  await anonymous.close();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await login(outsider, "tester@e2e.test");
  const own = (await call(outsider, "/api/projects", "POST", { name: `مشروع آخر ${Date.now()}` })).data;
  // tester is a member of the seeded project, so use their own unrelated project to probe cross-project ids.
  expect((await raw(outsider, `/api/projects/${own.id}/evidence/${file.id}`)).status()).toBe(404);
  expect((await raw(outsider, `/api/projects/${own.id}/issues/${created.id}`)).status()).toBe(404);
  const noCsrf = await outsider.request.fetch(`${ORIGIN}${base}/issues`, { method: "POST", data: issue("بلا CSRF"), headers: { Accept: "application/json", Origin: ORIGIN } });
  expect(noCsrf.status()).toBe(419);
  await outsiderContext.close();
});

test("main screens pass accessibility, RTL, responsive and dark-mode checks", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "owner@e2e.test");
  const { project, run, issue: created } = await seedProject(page);
  const paths = ["/", `/projects/${project.id}`, `/projects/${project.id}/tests`, `/projects/${project.id}/runs/${run.id}`, `/projects/${project.id}/issues`, `/projects/${project.id}/issues/new`, `/projects/${project.id}/issues/${created.id}`, `/projects/${project.id}/analytics`];
  const audit = () =>
    page.evaluate(() => {
      const named = (el: Element) => {
        const input = el as HTMLInputElement;
        return !!(input.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title"));
      };
      const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => !named(el));
      const buttons = [...document.querySelectorAll("button, a[href]")].filter((el) => !(el.textContent || "").trim() && !el.getAttribute("aria-label") && !el.querySelector("img[alt]:not([alt=''])"));
      const images = [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt"));
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        h1: document.querySelectorAll("h1").length,
        unnamedControls: controls.map((el) => el.outerHTML.slice(0, 80)),
        unnamedButtons: buttons.map((el) => el.outerHTML.slice(0, 80)),
        imagesWithoutAlt: images.length,
        duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator(".empty[role=status]")).toHaveCount(0, { timeout: 10_000 });
      await page.waitForLoadState("networkidle");
      const result = await audit();
      expect.soft(result.lang, path).toBe("ar");
      expect.soft(result.dir, path).toBe("rtl");
      expect.soft(result.h1, path).toBeGreaterThanOrEqual(1);
      expect.soft(result.unnamedControls, path).toEqual([]);
      expect.soft(result.unnamedButtons, path).toEqual([]);
      expect.soft(result.imagesWithoutAlt, path).toBe(0);
      expect.soft(result.duplicateIds, path).toEqual([]);
      expect.soft(result.overflow, `${path} @${width}`).toBeLessThanOrEqual(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${project.id}/issues/${created.id}`);
  await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "محاولات إعادة الاختبار" })).toBeVisible();
  await page.screenshot({ path: "test-results/issue-detail-dark-mobile.png", fullPage: true });
  await page.goto(`/projects/${project.id}/analytics`);
  await expect(page.getByRole("heading", { name: "التحليلات والتقارير" })).toBeVisible();
  await expect(page.locator(".kpi").first()).toBeVisible();
  await page.screenshot({ path: "test-results/analytics-dark-mobile.png", fullPage: true });
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(focused);
  expect(errors).toEqual([]);
});
