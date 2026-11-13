import { test, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

// User management through the UI with independent browser contexts:
// temporary password + forced change, invitation + acceptance, Team page
// flow, suspension/reactivation and invitation resend/revoke.

const OWNER_PASSWORD = "TestPilot-e2e-only-2026";
const NEW_PASSWORD = "Fresh-Account-Pass-2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
}

async function newPage(browser: Browser, errors: string[]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}

async function fillNewPassword(page: Page, password: string) {
  await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(password);
  await page.getByLabel("تأكيد كلمة المرور الجديدة").fill(password);
}

test("admin creates accounts, invites, forces password change and suspends from the UI", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stamp = Date.now();
  const tempEmail = `temp.${stamp}@example.test`;
  const inviteEmail = `invited.${stamp}@example.test`;

  await login(page, "owner@e2e.test", OWNER_PASSWORD);
  await expect(page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
  await page.getByRole("link", { name: "مشروع جديد", exact: true }).first().click();
  const projectName = `فريق ${stamp}`;
  await page.getByLabel("اسم المشروع", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "متابعة للمراجعة" }).click();
  await page.getByRole("button", { name: "إنشاء المشروع", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);
  const projectPath = new URL(page.url()).pathname;

  // 1. Create an account with a generated temporary password from «إدارة المستخدمين».
  await page.getByRole("link", { name: "إدارة المستخدمين" }).click();
  await expect(page.getByRole("heading", { name: "إدارة المستخدمين", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "إضافة مستخدم" }).first().click();
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(tempEmail);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("حساب مؤقت");
  await page.getByRole("combobox", { name: "المشروع", exact: true }).selectOption({ label: projectName });
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel(/كلمة مرور مؤقتة/).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  const secret = page.getByLabel("كلمة المرور المؤقتة", { exact: true }).filter({ has: page.locator("xpath=self::code") }).or(page.locator(".secret-value code"));
  await expect(secret.first()).toBeVisible();
  const temporary = (await secret.first().textContent())!.trim();
  expect(temporary.length).toBeGreaterThanOrEqual(20);
  await page.getByRole("button", { name: /نقلتها بأمان/ }).click();
  await expect(page.locator(".secret-value")).toHaveCount(0);

  // 2. The new user must change the temporary password before anything else.
  const temp = await newPage(browser, errors);
  await login(temp.page, tempEmail, temporary);
  await expect(temp.page.getByRole("heading", { name: "غيّر كلمة المرور المؤقتة" })).toBeVisible();
  const csrf = (await temp.context.cookies()).find((c) => c.name === "XSRF-TOKEN")!.value;
  const blocked = await temp.page.request.get("http://127.0.0.1:5174/api/dashboard", { headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174", "X-XSRF-TOKEN": decodeURIComponent(csrf) } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("password_change_required");
  await temp.page.getByLabel("كلمة المرور الحالية").fill(temporary);
  await fillNewPassword(temp.page, NEW_PASSWORD);
  await temp.page.getByRole("button", { name: "حفظ كلمة المرور والمتابعة" }).click();
  await expect(temp.page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
  await temp.page.goto(projectPath);
  await expect(temp.page.getByRole("heading", { name: projectName })).toBeVisible();

  // 3. Invite a brand-new person from the project's Team page; accept in another browser.
  await page.goto(`${projectPath}/team`);
  const flow = page.locator(".member-flow");
  await flow.getByLabel("البريد الإلكتروني", { exact: true }).fill(inviteEmail);
  await flow.getByRole("combobox", { name: "الصلاحية" }).selectOption("viewer");
  await flow.getByRole("button", { name: "متابعة" }).click();
  await expect(flow.getByText("لا يوجد حساب بهذا البريد.")).toBeVisible();
  await flow.getByRole("button", { name: "إرسال دعوة" }).click();
  const link = (await flow.locator(".secret-value code").textContent())!.trim();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9]{48}$/);
  await flow.getByRole("button", { name: /نقلتها بأمان/ }).click();
  await expect(flow.getByRole("cell", { name: inviteEmail, exact: true })).toBeVisible();

  const invited = await newPage(browser, errors);
  await invited.page.goto(new URL(link).pathname);
  await expect(invited.page.getByRole("heading", { name: "قبول الدعوة" })).toBeVisible();
  await expect(invited.page.getByText(projectName, { exact: false })).toBeVisible();
  await invited.page.getByLabel("الاسم الكامل").fill("عضو مدعو");
  await fillNewPassword(invited.page, NEW_PASSWORD);
  await invited.page.getByRole("button", { name: "إنشاء الحساب والانضمام" }).click();
  await expect(invited.page).toHaveURL(new RegExp(`${projectPath}$`));
  await expect(invited.page.getByRole("heading", { name: projectName })).toBeVisible();
  await invited.page.goto(new URL(link).pathname);
  await expect(invited.page.getByRole("heading", { name: "استُخدمت هذه الدعوة" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "عضو مدعو" })).toBeVisible();

  // 4. Suspend the first account from its detail page; its session is cut off.
  await page.goto("/admin/users");
  await page.getByRole("searchbox").fill(tempEmail);
  await page.getByRole("button", { name: "بحث" }).click();
  await page.getByRole("link", { name: /حساب مؤقت/ }).click();
  await page.getByRole("textbox", { name: "سبب الإيقاف" }).fill("اختبار الإيقاف المؤقت");
  await page.getByRole("button", { name: "تعليق الحساب" }).click();
  await expect(page.locator(".issue-badges").getByText("معلّق")).toBeVisible();
  await temp.page.goto("/");
  // Sessions are revoked on suspension, so the user is either signed out or shown the inactive screen.
  await expect(temp.page).toHaveURL(/\/(login|account-inactive)$/);
  await login(temp.page, tempEmail, NEW_PASSWORD);
  await expect(temp.page).toHaveURL(/\/account-inactive$/);
  await expect(temp.page.getByRole("heading", { name: "الحساب موقوف" })).toBeVisible();
  await page.getByRole("button", { name: "إعادة تفعيل الحساب" }).click();
  await expect(page.locator(".issue-badges").getByText("نشط")).toBeVisible();
  await login(temp.page, tempEmail, NEW_PASSWORD);
  await expect(temp.page.getByRole("heading", { name: "نظرة واضحة على الجودة" })).toBeVisible();
  await expect(page.getByRole("region", { name: "سجل إدارة الحساب" }).or(page.locator(".issue-timeline"))).toContainText("تغيير حالة الحساب");

  // 5. Resend rotates the link; revoke disables it.
  const lateEmail = `late.${stamp}@example.test`;
  await page.goto(`${projectPath}/team`);
  await flow.getByLabel("البريد الإلكتروني", { exact: true }).fill(lateEmail);
  await flow.getByRole("button", { name: "متابعة" }).click();
  await flow.getByRole("button", { name: "إرسال دعوة" }).click();
  const firstLink = (await flow.locator(".secret-value code").textContent())!.trim();
  await flow.getByRole("button", { name: /نقلتها بأمان/ }).click();
  await flow.getByRole("button", { name: `إعادة إرسال دعوة ${lateEmail}` }).click();
  const secondLink = (await flow.locator(".secret-value code").textContent())!.trim();
  expect(secondLink).not.toBe(firstLink);
  await flow.getByRole("button", { name: /نقلتها بأمان/ }).click();
  await flow.getByRole("button", { name: `إلغاء دعوة ${lateEmail}` }).click();
  await expect(flow.getByRole("row", { name: new RegExp(lateEmail) })).toContainText("ملغاة");
  const anon = await newPage(browser, errors);
  await anon.page.goto(new URL(firstLink).pathname);
  await expect(anon.page.getByRole("heading", { name: "رابط الدعوة غير صالح" })).toBeVisible();
  await anon.page.goto(new URL(secondLink).pathname);
  await expect(anon.page.getByRole("heading", { name: "أُلغيت هذه الدعوة" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/users");
  await expect(page.locator(".users-table")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/users-admin-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/users-admin.png", fullPage: true });
  expect(errors).toEqual([]);
  await Promise.all([temp.context.close(), invited.context.close(), anon.context.close()]);
});
