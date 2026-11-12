import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Verifies the global typography: Thmanyah faces when the licensed files are present
// locally, the bundled Noto Sans Arabic fallback otherwise (e.g. CI), on every main screen.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("owner@e2e.test");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
}

async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`http://127.0.0.1:5174${path}`, { method, data, headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174", "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("brand typography loads and applies to every element type on light/dark, desktop/mobile", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const project = (await call(page, "/api/projects", "POST", { name: `الخطوط ${Date.now()}` })).data;
  const base = `/api/projects/${project.id}`;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "الطباعة", position: 0, archived: false })).data;
  await call(page, `${base}/issues`, "POST", { title: "مشكلة لعرض الخط", description: "نص عربي لاختبار الخط", reproduction_steps: "1. افتح", expected_result: "يظهر", actual_result: "لا يظهر", severity: "major", priority: "high" });
  const mode = await page.evaluate(() => document.documentElement.dataset.fonts);
  expect(["thmanyah", "fallback"]).toContain(mode);
  const screens = [
    ["dashboard", "/"],
    ["project", `/projects/${project.id}`],
    ["builder", `/projects/${project.id}/tests/new?suite=${suite.id}`],
    ["issues", `/projects/${project.id}/issues`],
    ["analytics", `/projects/${project.id}/analytics`],
  ] as const;

  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, path] of screens) {
        await page.goto(path);
        if (theme === "dark" && (await page.locator(".app").getAttribute("data-theme")) !== "dark") {
          await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
        }
        await expect(page.locator(".empty[role=status]")).toHaveCount(0, { timeout: 10_000 });
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const family = (selector: string) => {
            const el = document.querySelector(selector);
            return el ? getComputedStyle(el).fontFamily : null;
          };
          return {
            body: family("body"),
            h1: family("h1"),
            button: family("button"),
            input: family("input, select, textarea"),
            table: family("td, th"),
            sansLoaded: document.fonts.check('500 16px "Thmanyah Sans"', "ثراء"),
            displayLoaded: document.fonts.check('700 30px "Thmanyah Serif Display"', "ثراء"),
            notoLoaded: document.fonts.check('16px "Noto Sans Arabic Variable"', "ثراء"),
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            dir: document.documentElement.dir,
          };
        });
        const label = `${name} ${theme} ${width}`;
        expect.soft(result.dir, label).toBe("rtl");
        expect.soft(result.overflow, label).toBeLessThanOrEqual(0);
        for (const key of ["body", "button", "input", "table"] as const) {
          if (result[key]) expect.soft(result[key], `${label} ${key}`).toMatch(/^"?Thmanyah Sans"?, "?Noto Sans Arabic Variable/);
        }
        expect.soft(result.h1, label).toMatch(/^"?Thmanyah Serif Display"?/);
        if (mode === "thmanyah") {
          expect.soft(result.sansLoaded, `${label} sans loaded`).toBe(true);
          expect.soft(result.displayLoaded, `${label} display loaded`).toBe(true);
        } else {
          expect.soft(result.notoLoaded, `${label} fallback loaded`).toBe(true);
        }
        if (width === 390 || name === "dashboard" || name === "issues") {
          await page.screenshot({ path: `test-results/type-${name}-${theme}-${width}.png`, fullPage: true });
        }
      }
    }
  }
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`));
  if (mode === "thmanyah") {
    for (const face of ['"Thmanyah Sans" 400', '"Thmanyah Sans" 500', '"Thmanyah Sans" 700', '"Thmanyah Serif Display" 700']) {
      expect(loaded.map((l) => l.replaceAll('"', ""))).toContain(face.replaceAll('"', ""));
    }
  }
});
