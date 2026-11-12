import { test, expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('http://127.0.0.1:5174/login')
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(email)
  await page.getByLabel('كلمة المرور', { exact: true }).fill('TestPilot-e2e-only-2026')
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'نظرة واضحة على الجودة' })).toBeVisible()
}
async function call(page: Page, path: string, method = 'GET', body?: unknown) {
  const csrf = (await page.context().cookies()).find(c => c.name === 'XSRF-TOKEN')!.value
  const response = await page.request.fetch(`http://127.0.0.1:5174${path}`, { method, data: body, headers: { Accept: 'application/json', Origin: 'http://127.0.0.1:5174', 'X-XSRF-TOKEN': decodeURIComponent(csrf) } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}
async function saveResult(column: Locator, step: number, text: string) {
  const card = column.getByRole('article', { name: `نتيجة الخطوة ${step}`, exact: true })
  await card.getByRole('textbox', { name: 'النتيجة الفعلية', exact: true }).fill(text)
  await card.getByLabel('تحققت فعليًا من النتيجة المتوقعة').check()
  await card.getByRole('button', { name: 'حفظ نتيجة الخطوة', exact: true }).click()
  await expect(card.getByRole('status')).toHaveText('حُفظت النتيجة')
}
test('two independent testers synchronize checkpoints and explicitly assess a frozen run', async ({ page, browser }) => {
  test.setTimeout(90_000)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await login(page, 'owner@e2e.test')
  const project = (await call(page, '/api/projects', 'POST', { name: `تعاون ${Date.now()}` })).data
  const base = `/api/projects/${project.id}`
  const members = (await call(page, `${base}/members`, 'PUT', { email: 'tester@e2e.test', role: 'tester' })).data.members as { id: number; email: string }[]
  const environment = (await call(page, `${base}/environments`, 'POST', { name: 'بيئة التعاون' })).data
  const suite = (await call(page, `${base}/suites`, 'POST', { name: 'الدعوات', position: 0, archived: false })).data
  const template = (await call(page, `${base}/scenario-templates`)).data.find((t: { id: string }) => t.id === 'collaboration')
  await call(page, `${base}/scenarios`, 'POST', { ...template.content, suite_id: suite.id, status: 'ready', title: 'دعوة وقبول وتحقق' })
  await page.goto(`/projects/${project.id}/runs/new`)
  await page.getByLabel('عنوان الجلسة', { exact: true }).fill('تعاون فعلي بين حسابين')
  await page.getByLabel('إصدار التطبيق المختبَر').fill('build-e2e')
  await page.getByRole('combobox', { name: 'البيئة', exact: true }).selectOption(String(environment.id))
  await page.getByRole('combobox', { name: 'Tester A', exact: true }).selectOption(String(members.find(m => m.email === 'owner@e2e.test')!.id))
  await page.getByRole('combobox', { name: 'Tester B', exact: true }).selectOption(String(members.find(m => m.email === 'tester@e2e.test')!.id))
  await page.getByRole('checkbox', { name: /دعوة وقبول وتحقق/ }).check()
  await page.getByRole('button', { name: 'بدء الجلسة', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/\d+$/)
  const runUrl = page.url()
  const second = await browser.newContext(); const tester = await second.newPage(); tester.on('pageerror', e => errors.push(e.message))
  await login(tester, 'tester@e2e.test'); await tester.goto(runUrl)
  const colA = page.getByRole('region', { name: 'خطوات Tester A', exact: true })
  const colB = tester.getByRole('region', { name: 'خطوات Tester B', exact: true })
  await expect(tester.getByRole('region', { name: 'خطوات Tester A', exact: true }).getByRole('button', { name: 'حفظ نتيجة الخطوة' })).toHaveCount(0)
  await page.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).click()
  await expect(tester.getByRole('button', { name: 'استئناف الجلسة', exact: true })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'استئناف الجلسة', exact: true }).click()
  await saveResult(colA, 1, 'أُنشئت الدعوة بالدور المتوقع')
  await saveResult(colA, 2, 'ظهرت الدعوة المعلقة في القائمة')
  await expect(tester.getByText('ظهرت الدعوة المعلقة في القائمة', { exact: true })).toBeVisible({ timeout: 10000 })
  await saveResult(colB, 3, 'قُبلت الدعوة بحساب المختبر الثاني')
  await tester.reload()
  await expect(colB.getByRole('article', { name: 'نتيجة الخطوة 3', exact: true }).getByRole('textbox', { name: 'النتيجة الفعلية', exact: true })).toHaveValue('قُبلت الدعوة بحساب المختبر الثاني', { timeout: 15000 })
  await saveResult(colA, 4, 'أكد المرسل العضوية والدور الصحيح')
  await saveResult(colB, 4, 'أكد المدعو ظهور المؤسسة والدور الصحيح')
  await expect(page.getByText('5 / 5', { exact: true })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: 'اعتماد التقييم النهائي' })).toBeVisible()
  await page.screenshot({ path: 'test-results/collaborative-runner.png', fullPage: true })
  await page.getByLabel('خلاصة التحقق').fill('راجع المختبران العضوية والدور والنتائج الفعلية بصورة مستقلة.')
  await page.getByRole('button', { name: 'اعتماد التقييم النهائي' }).click()
  await expect(page.locator('.final-assessment').getByText('ناجحة', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/runner-mobile.png', fullPage: true })
  expect(errors).toEqual([])
  await second.close()
})


