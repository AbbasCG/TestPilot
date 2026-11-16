import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Before/after screenshots of four key screens with real local data created through the API.
// SHOT_SET=before|after (default after) names the files in docs/redesign.

const SET = process.env.SHOT_SET ?? "after";
const OUT = "../docs/redesign";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWNUjjnOgA0wYRUdtBIAApcBVuhaAw8AAAAASUVORK5CYII=", "base64");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPilot-e2e-only-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/", { timeout: 15_000 });
}

async function call(page: Page, path: string, method = "GET", data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const response = await page.request.fetch(`http://127.0.0.1:5174${path}`, { method, data, headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174", "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

const steps = (prefix: string) =>
  [
    ["navigate", "افتح صفحة الدعوات", "تظهر قائمة الدعوات الحالية", "A", "/organizations/manage"],
    ["input", "أدخل بريد المعلّم والدور", "يقبل الحقل البريد ويعرض الدور المختار", "A", ""],
    ["click", "أرسل الدعوة", "تظهر دعوة معلّقة بالدور الصحيح", "A", ""],
    ["click", "اقبل الدعوة بحساب المدعو", "تنجح عملية الانضمام", "B", ""],
    ["verify", "تحقق من أن المعلّم يظهر في المجموعة", "يظهر المعلّم بدور «معلم» في المجموعة", "A", ""],
    ["shared_checkpoint", "العضوية والدور من الطرفين", "يؤكد الطرفان العضوية والدور", "both", ""],
  ].map(([type, title, expected, role, path], i) => ({
    id: `00000000-0000-4000-8000-${prefix}${String(i + 1).padStart(6, "0")}`,
    type, title, assigned_role: role, url: path ? `https://demo.example.test${path}` : "", target: "", value: i === 1 ? "teacher@example.test — دور: معلم" : "",
    expected_result: expected, instructions: "نفّذ على بيانات تجريبية في بيئة الاختبار وسجّل النتيجة الفعلية.", checkpoint: type === "shared_checkpoint" ? expected : "",
    evidence_required: i === 2, depends_on: i ? [`00000000-0000-4000-8000-${prefix}${String(i).padStart(6, "0")}`] : [],
  }));

test(`capture ${SET} screens`, async ({ page, browser }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await login(page, "owner@e2e.test");
  const project = (await call(page, "/api/projects", "POST", { name: "منصة المدارس التجريبية", description: "مشروع محلي لمعاينة التصميم" })).data;
  const base = `/api/projects/${project.id}`;
  const members = (await call(page, `${base}/members`, "PUT", { email: "tester@e2e.test", role: "tester" }).catch(() => null)) ?? null;
  const environment = (await call(page, `${base}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" })).data;
  const suite = (await call(page, `${base}/suites`, "POST", { name: "الدعوات والعضويات", position: 0, archived: false })).data;
  const content = (title: string, status: string, priority: string, prefix: string) => ({
    suite_id: suite.id, environment_id: null, title, description: "", objective: "التحقق من أن المعلّم المدعو ينضم بالدور الصحيح.", priority, test_type: "functional", status, is_template: false,
    prerequisites: "مؤسسة مرخّصة وحساب مدير مفعّل.", required_account: "", required_role: "", test_data: "", expected_results: "ينضم المعلّم بالدور الصحيح.", acceptance_criteria: "تتطابق كل النتائج الفعلية مع المتوقعة.",
    dependencies: [], steps: steps(prefix),
  });
  const ready = (await call(page, `${base}/scenarios`, "POST", content("دعوة معلّم وقبولها", "ready", "high", "aaaaaa"))).data;
  await call(page, `${base}/scenarios`, "POST", content("تسجيل الدخول بحساب موقوف", "draft", "medium", "bbbbbb"));
  await call(page, `${base}/scenarios`, "POST", content("استعادة كلمة المرور", "ready", "critical", "cccccc"));
  void members;
  const users = (await call(page, `${base}`)).data.members as { id: number; email: string }[];
  const owner = users.find((m) => m.email === "owner@e2e.test")!.id;
  const tester = users.find((m) => m.email === "tester@e2e.test")!.id;
  const run = (await call(page, `${base}/runs`, "POST", { title: "اختبار قبول الإصدار", build_version: "v2.4.0", environment_id: environment.id, suite_id: suite.id, tester_a_id: owner, tester_b_id: tester, scenarios: [{ id: ready.id, version: 1 }] })).data;
  const mine = run.results.filter((r: { participant_id: number }) => r.participant_id === run.participants.find((p: { user_id: number }) => p.user_id === owner).id);
  await call(page, `${base}/runs/${run.id}/results/${mine[0].id}`, "PUT", { version: 0, status: "passed", actual_result: "ظهرت قائمة الدعوات", verified: true });
  await call(page, `${base}/runs/${run.id}/results/${mine[1].id}`, "PUT", { version: 0, status: "passed", actual_result: "قُبل البريد والدور", verified: true });
  await call(page, `${base}/runs/${run.id}/results/${mine[2].id}`, "PUT", { version: 0, status: "failed", actual_result: "ظهرت رسالة خطأ 500 عند إرسال الدعوة", verified: false });
  const issue = (await call(page, `${base}/issues`, "POST", {
    title: "فشل إرسال الدعوة بخطأ 500", description: "عند إرسال دعوة معلّم من شاشة الدعوات يعيد الخادم خطأ 500.", reproduction_steps: "1. افتح الدعوات\n2. أدخل بريد المعلّم\n3. اضغط إرسال",
    expected_result: "تظهر دعوة معلّقة بالدور الصحيح", actual_result: "ظهرت رسالة خطأ 500", severity: "critical", priority: "urgent", build_version: "v2.4.0", step_result_id: mine[2].id,
  })).data;
  const csrf = decodeURIComponent((await page.context().cookies()).find((c) => c.name === "XSRF-TOKEN")!.value);
  await page.request.fetch(`http://127.0.0.1:5174${base}/evidence`, { method: "POST", headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174", "X-XSRF-TOKEN": csrf }, multipart: { kind: "screenshot", issue_id: String(issue.id), file: { name: "error-500.png", mimeType: "image/png", buffer: PNG } } });
  await call(page, `${base}/issues/${issue.id}/comments`, "POST", { body: "تكرر الخطأ على Staging فقط." });

  const shots: [string, string, (p: Page) => Promise<void>][] = [
    ["home", "/", async (p) => { await expect(p.locator("h1").first()).toBeVisible(); }],
    ["scenarios", `/projects/${project.id}/tests`, async (p) => { await expect(p.getByText("دعوة معلّم وقبولها").first()).toBeVisible(); }],
    ["runner", `/projects/${project.id}/runs/${run.id}`, async (p) => { await expect(p.getByText("اختبار قبول الإصدار").first()).toBeVisible(); }],
    ["issue", `/projects/${project.id}/issues/${issue.id}`, async (p) => { await expect(p.getByText("فشل إرسال الدعوة بخطأ 500").first()).toBeVisible(); }],
  ];
  for (const [theme, width, height] of [["light", 1440, 1000], ["dark", 1440, 1000], ["light", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, path, ready] of shots) {
      await page.goto(path);
      const dark = (await page.locator(".app").getAttribute("data-theme")) === "dark";
      if ((theme === "dark") !== dark) await page.getByRole("button", { name: /تفعيل الوضع/ }).click();
      await ready(page);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/${SET}-${name}-${theme}-${width}.png`, fullPage: name !== "home" || width < 1000 ? true : false });
    }
  }
  await page.getByRole("button", { name: /تفعيل الوضع الفاتح/ }).click({ timeout: 1500 }).catch(() => undefined);
  void browser;
});
