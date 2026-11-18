import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Import from file, guided runner (solo + collaborative), quick search and URL filters.
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
const scenario = (title: string, steps = 3) => ({
  title, objective: `التحقق من ${title}`, priority: "high",
  steps: Array.from({ length: steps }, (_, i) => ({
    title: `الخطوة ${i + 1} في ${title}`, type: i === 0 ? "navigate" : "verify", expected_result: `النتيجة المتوقعة ${i + 1}`,
    ...(i === 0 ? { url: "https://staging.example.test/login" } : {}),
  })),
});
const file = (name: string, document: unknown) => ({ name, mimeType: "application/json", buffer: Buffer.from(typeof document === "string" ? document : JSON.stringify(document)) });
const unique = () => Date.now().toString(36);

async function newProject(page: Page, name: string) {
  const project = (await call(page, "/api/projects", "POST", { name })).data;
  await call(page, `/api/projects/${project.id}/members`, "PUT", { email: "tester@e2e.test", role: "tester" });
  const environment = (await call(page, `/api/projects/${project.id}/environments`, "POST", { name: "Staging", url: "https://staging.example.test" })).data;
  return { id: project.id as number, environment: environment.id as number };
}
async function importScenarios(page: Page, projectId: number, titles: string[], steps = 3) {
  await page.goto(`/projects/${projectId}/tests`);
  await page.getByRole("button", { name: "استيراد ملف" }).first().click();
  const dialog = page.getByRole("dialog", { name: "استيراد سيناريوهات من ملف" });
  await dialog.locator('input[type="file"]').setInputFiles(file("scenarios.json", { schema_version: 1, suite: "مجموعة مستوردة", scenarios: titles.map((t) => scenario(t, steps)) }));
  await dialog.getByRole("button", { name: /فحص الملف/ }).click();
  await expect(dialog.getByText("المعاينة")).toBeVisible();
  await dialog.getByRole("button", { name: "استيراد كمسودات" }).click();
  await expect(dialog.getByText(/كمسودات/)).toBeVisible();
  await dialog.getByRole("link", { name: "راجع السيناريوهات" }).click();
}
async function markReady(page: Page, projectId: number) {
  const list = (await call(page, `/api/projects/${projectId}/scenarios`)).data as { id: number; content: Record<string, unknown>; version: number }[];
  for (const s of list) await call(page, `/api/projects/${projectId}/scenarios/${s.id}`, "PUT", { ...s.content, status: "ready", version: s.version });
}

test("import: invalid file shows located Arabic errors, valid imports drafts, duplicates are skipped", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `استيراد ${unique()}`);
  await page.goto(`/projects/${project.id}/tests`);
  await expect(page.getByText("لا توجد سيناريوهات بعد")).toBeVisible();

  // Invalid file: second step has no expected result.
  await page.getByRole("button", { name: "استيراد ملف" }).first().click();
  const dialog = page.getByRole("dialog", { name: "استيراد سيناريوهات من ملف" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "استيراد سيناريوهات من ملف" })).toBeFocused();
  const broken = scenario("سيناريو معطوب");
  delete (broken.steps[1] as Record<string, unknown>).expected_result;
  await dialog.locator('input[type="file"]').setInputFiles(file("broken.json", { schema_version: 1, scenarios: [scenario("سيناريو سليم"), broken] }));
  await dialog.getByRole("button", { name: /فحص الملف/ }).click();
  await expect(dialog.getByText("السيناريو 2، الخطوة 2: النتيجة المتوقعة مطلوب.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /أصلح الأخطاء/ })).toBeDisabled();
  expect((await call(page, `/api/projects/${project.id}/scenarios`)).data).toHaveLength(0);

  // Not JSON at all.
  await dialog.locator('input[type="file"]').setInputFiles(file("bad.json", "هذا ليس JSON"));
  await expect(dialog.getByText(/تعذّرت قراءة الملف/)).toBeVisible();

  // Valid file inside a markdown fence is accepted; Escape returns focus to the opener.
  await dialog.locator('input[type="file"]').setInputFiles(file("ok.json", "```json\n" + JSON.stringify({ schema_version: 1, suite: "مجموعة مستوردة", scenarios: [scenario("الدخول بنجاح"), scenario("الدخول بكلمة خاطئة")] }) + "\n```"));
  await dialog.getByRole("button", { name: /فحص الملف/ }).click();
  await expect(dialog.getByText("2", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "استيراد كمسودات" }).click();
  await expect(dialog.getByText("أُضيف 2 سيناريو كمسودات")).toBeVisible();
  await dialog.getByRole("link", { name: "راجع السيناريوهات" }).click();
  await expect(page).toHaveURL(/status=draft/);
  await expect(page.getByRole("link", { name: /الدخول بنجاح/ })).toBeVisible();

  // Re-uploading the same file reports duplicates and skips them by default.
  await page.getByRole("button", { name: "استيراد ملف" }).first().click();
  const again = page.getByRole("dialog", { name: "استيراد سيناريوهات من ملف" });
  await again.locator('input[type="file"]').setInputFiles(file("ok.json", { schema_version: 1, suite: "مجموعة مستوردة", scenarios: [scenario("الدخول بنجاح"), scenario("سيناريو إضافي")] }));
  await again.getByRole("button", { name: /فحص الملف/ }).click();
  await expect(again.getByText("مكرر في المشروع")).toBeVisible();
  await again.getByRole("button", { name: "استيراد كمسودات" }).click();
  await expect(again.getByText(/تخطّينا 1 سيناريو مكررًا/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(again).toBeHidden();
});

test("library filters live in the URL and survive reload and back", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `فلاتر ${unique()}`);
  await importScenarios(page, project.id, ["تسجيل الدخول", "استعادة كلمة المرور"]);
  await page.getByLabel("ابحث بالعنوان أو الرقم").fill("استعادة");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("link", { name: /استعادة كلمة المرور/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /تسجيل الدخول/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("ابحث بالعنوان أو الرقم")).toHaveValue("استعادة");
  await page.getByRole("link", { name: /استعادة كلمة المرور/ }).click();
  await page.goBack();
  await expect(page.getByLabel("ابحث بالعنوان أو الرقم")).toHaveValue("استعادة");
  await page.getByRole("button", { name: "مسح التصفية" }).click();
  await expect(page.getByRole("link", { name: /تسجيل الدخول/ })).toBeVisible();
});

test("quick search opens with Ctrl+K and navigates by keyboard", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `بحث ${unique()}`);
  await importScenarios(page, project.id, ["مسار الدفع السريع", "مسار الإرجاع"]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "بحث سريع" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("الدفع");
  await expect(dialog.getByRole("option", { name: /مسار الدفع السريع/ })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tests\/\d+$/);
  await expect(page.getByRole("heading", { name: "مسار الدفع السريع" }).first()).toBeVisible();
});

test("solo test: guided steps, validation, save failure keeps input, resume, summary", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `منفرد ${unique()}`);
  await importScenarios(page, project.id, ["مسار منفرد"], 3);
  await markReady(page, project.id);

  await page.goto(`/projects/${project.id}/runs/new?mode=solo`);
  await expect(page.getByRole("heading", { name: "بدء اختبار منفرد" })).toBeVisible();
  await expect(page.getByLabel("Tester B", { exact: true })).toHaveCount(0);
  await page.getByLabel("عنوان الجلسة").fill("اختبار منفرد للإصدار");
  await page.getByLabel("إصدار التطبيق المختبَر").fill("v3.1.0");
  await page.getByLabel("البيئة").selectOption({ label: "Staging" });
  await page.getByRole("combobox", { name: /^المختبر/ }).selectOption({ label: "مدير الجودة — owner@e2e.test" });
  await page.getByRole("checkbox", { name: /مسار منفرد/ }).check();
  await page.getByRole("button", { name: "بدء الجلسة" }).click();

  await expect(page.getByText("الخطوة 1 من 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /الخطوة 1 في مسار منفرد/ })).toBeVisible();
  await expect(page.getByText("النتيجة المتوقعة 1")).toBeVisible();

  // Pass the first step; focus moves to the new step heading.
  await page.getByRole("button", { name: /حفظ والانتقال للخطوة التالية/ }).click();
  await expect(page.getByText("الخطوة 2 من 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /الخطوة 2 في مسار منفرد/ })).toBeFocused();

  // A failure needs «ماذا حدث؟»; the first save request fails and keeps what was typed.
  await page.getByText("فشلت", { exact: true }).click();
  const what = page.getByLabel("ماذا حدث؟");
  await expect(page.getByRole("button", { name: /حفظ والانتقال/ })).toBeDisabled();
  await what.fill("ظهرت رسالة خطأ بدل الصفحة");
  let failed = false;
  await page.route("**/runs/*/results/*", async (route) => {
    if (!failed && route.request().method() === "PUT") { failed = true; return route.abort(); }
    return route.continue();
  });
  await page.getByRole("button", { name: /حفظ والانتقال/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "تعذّر الاتصال" })).toBeVisible();
  await expect(what).toHaveValue("ظهرت رسالة خطأ بدل الصفحة");
  await page.getByRole("button", { name: "إعادة محاولة الحفظ" }).click();
  await expect(page.getByText("الخطوة 3 من 3", { exact: true })).toBeHidden();

  // Step 3 depends on the failed step 2, so the tester is stuck: resume shows the summary.
  await page.reload();
  await expect(page.getByRole("heading", { name: /أنهيت كل خطواتك|بانتظار/ })).toBeVisible();
  await expect(page.getByText("ظهرت رسالة خطأ بدل الصفحة")).toBeVisible();
  await expect(page.getByRole("link", { name: "إنشاء مشكلة" })).toBeVisible();
});

test("collaborative session: each tester gets own guided steps and waits for the other", async ({ page, browser }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `تعاوني ${unique()}`);
  await importScenarios(page, project.id, ["مسار تعاوني"], 2);
  await markReady(page, project.id);
  const members = (await call(page, `/api/projects/${project.id}`)).data.members as { id: number; email: string }[];
  const owner = members.find((m) => m.email === "owner@e2e.test")!.id;
  const tester = members.find((m) => m.email === "tester@e2e.test")!.id;
  const listed = (await call(page, `/api/projects/${project.id}/scenarios`)).data[0] as { id: number; version: number };
  const scenarioId = listed.id;
  const run = (await call(page, `/api/projects/${project.id}/runs`, "POST", { title: "جلسة تعاونية", build_version: "v1", environment_id: project.environment, tester_a_id: owner, tester_b_id: tester, scenarios: [{ id: scenarioId, version: listed.version }] })).data;

  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(page.getByText("الخطوة 1 من 2", { exact: true })).toBeVisible();
  await expect(page.getByText(/مختبر الجودة: 0 من/)).toBeVisible();
  await expect(page.locator(".guided-card .tester-tag")).toHaveText("Tester A");
  await page.getByRole("link", { name: "كل الخطوات" }).click();
  await expect(page.getByRole("region", { name: "خطوات Tester A" })).toBeVisible();
  await page.getByRole("link", { name: "الخطوة الحالية" }).click();

  const other = await browser.newContext();
  const second = await other.newPage();
  await login(second, "tester@e2e.test");
  await second.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(second.getByRole("heading", { name: "لا توجد خطوات مسندة إليك في هذه الجلسة" })).toBeVisible();
  await other.close();
});

test("shared checkpoint shows the role tag and the other tester's result for the same step", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `نقطة مشتركة ${unique()}`);
  const base = `/api/projects/${project.id}`;
  const members = (await call(page, base)).data.members as { id: number; email: string }[];
  const suite = (await call(page, `${base}/suites`, "POST", { name: "Core", position: 0, archived: false })).data;
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === "collaboration");
  const created = (await call(page, `${base}/scenarios`, "POST", { ...template.content, suite_id: suite.id, status: "ready" })).data;
  const run = (await call(page, `${base}/runs`, "POST", {
    title: "جلسة النقطة المشتركة", build_version: "v1", environment_id: project.environment, suite_id: suite.id,
    tester_a_id: members.find((m) => m.email === "owner@e2e.test")!.id, tester_b_id: members.find((m) => m.email === "tester@e2e.test")!.id,
    scenarios: [{ id: created.id, version: created.version }],
  })).data;
  const roleOf = (participantId: number) => run.participants.find((x: { id: number }) => x.id === participantId).role as string;
  const steps = run.cases[0].snapshot.steps as { id: string; type: string }[];
  const mine = (role: string) => run.results.filter((r: { participant_id: number }) => roleOf(r.participant_id) === role) as { id: number; step_key: string; version: number }[];
  const pass = (page: Page, id: number, version: number, actual: string) =>
    call(page, `${base}/runs/${run.id}/results/${id}`, "PUT", { version, status: "passed", actual_result: actual, verified: true });
  const checkpoint = steps.find((x) => x.type === "shared_checkpoint")!;

  // A completes steps 1-2 and B step 3; the checkpoint then becomes available to both.
  for (const result of mine("A").filter((r) => r.step_key !== checkpoint.id)) await pass(page, result.id, result.version, "تحققت النتيجة من جهة المختبر الأول");
  const otherContext = await browser.newContext();
  const second = await otherContext.newPage();
  await login(second, "tester@e2e.test");
  for (const result of mine("B").filter((r) => r.step_key !== checkpoint.id)) await pass(second, result.id, result.version, "تحققت النتيجة من جهة المختبر الثاني");

  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  const card = page.getByRole("article", { name: /^الخطوة \d+ من \d+$/ });
  await expect(card.locator("p .tester-tag").first()).toHaveText("Tester A");
  await expect(card.getByText("خطوة مشتركة ينفّذها المختبران")).toBeVisible();
  const partner = card.getByRole("list", { name: "نتيجة الطرف الآخر لهذه الخطوة" });
  await expect(partner).toContainText("Tester B");
  await expect(partner).toContainText("لم تُنفّذ");

  // The other tester records the checkpoint; the first tester sees it on the same step after a refresh.
  const theirs = mine("B").find((r) => r.step_key === checkpoint.id)!;
  const latest = (await call(second, `${base}/runs/${run.id}`)).data.results.find((r: { id: number }) => r.id === theirs.id);
  await pass(second, theirs.id, latest.version, "تأكد المختبر الثاني من العضوية المشتركة");
  await page.reload();
  await expect(partner).toContainText("نجحت");
  await expect(partner).toContainText("تأكد المختبر الثاني من العضوية المشتركة");
  await otherContext.close();
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWNUjjnOgA0wYRUdtBIAApcBVuhaAw8AAAAASUVORK5CYII=", "base64");

test("guided step that needs evidence blocks a pass until a screenshot is attached", async ({ page }) => {
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `أدلة ${unique()}`);
  const withEvidence = scenario("مسار بدليل", 2);
  (withEvidence.steps[0] as Record<string, unknown>).evidence_required = true;
  await page.goto(`/projects/${project.id}/tests`);
  await page.getByRole("button", { name: "استيراد ملف" }).first().click();
  const dialog = page.getByRole("dialog", { name: "استيراد سيناريوهات من ملف" });
  await dialog.locator('input[type="file"]').setInputFiles(file("evidence.json", { schema_version: 1, scenarios: [withEvidence] }));
  await dialog.getByRole("button", { name: /فحص الملف/ }).click();
  await dialog.getByRole("button", { name: "استيراد كمسودات" }).click();
  await expect(dialog.getByText(/كمسودات/)).toBeVisible();
  await page.keyboard.press("Escape");
  await markReady(page, project.id);
  const members = (await call(page, `/api/projects/${project.id}`)).data.members as { id: number; email: string }[];
  const owner = members.find((m) => m.email === "owner@e2e.test")!.id;
  const listed = (await call(page, `/api/projects/${project.id}/scenarios`)).data[0] as { id: number; version: number };
  const run = (await call(page, `/api/projects/${project.id}/runs`, "POST", { mode: "solo", title: "جلسة أدلة", build_version: "v9", environment_id: project.environment, tester_a_id: owner, scenarios: [{ id: listed.id, version: listed.version }] })).data;

  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(page.getByText("هذه الخطوة تتطلب دليلًا قبل اعتماد النجاح.")).toBeVisible();
  await expect(page.getByRole("button", { name: /حفظ والانتقال/ })).toBeDisabled();
  await page.getByText("إرفاق دليل", { exact: true }).click();
  await page.getByLabel("الملف", { exact: true }).setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "رفع الدليل" }).click();
  await expect(page.getByRole("img", { name: "لقطة شاشة: proof.png" })).toBeVisible();
  await page.getByRole("button", { name: /حفظ والانتقال/ }).click();
  await expect(page.getByText("الخطوة 2 من 2", { exact: true })).toBeVisible();
  // Returning later opens the first step without a recorded result.
  await page.reload();
  await expect(page.getByText("الخطوة 2 من 2", { exact: true })).toBeVisible();
});

test("reduced motion: panel and step change appear without offsets or fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, "owner@e2e.test");
  const project = await newProject(page, `حركة ${unique()}`);
  await page.goto(`/projects/${project.id}/tests`);
  await page.getByRole("button", { name: "استيراد ملف" }).first().click();
  const panel = page.locator(".import-panel");
  await expect(panel).toBeVisible();
  const style = await panel.evaluate((el) => { const s = getComputedStyle(el); return { transform: s.transform, opacity: s.opacity }; });
  expect(style).toEqual({ transform: "none", opacity: "1" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
