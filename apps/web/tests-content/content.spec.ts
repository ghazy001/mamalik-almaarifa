import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONTENT_ACCOUNTS } from '../../game-server/tests/support/content-accounts';

async function login(page: Page, role: keyof typeof CONTENT_ACCOUNTS) {
  await page.goto('/signin');
  await page.getByLabel('البريد الإلكتروني').fill(CONTENT_ACCOUNTS[role].email);
  await page
    .getByLabel('كلمة المرور', { exact: true })
    .fill(CONTENT_ACCOUNTS[role].password);
  await page
    .getByRole('button', { name: 'دخول إلى دار المعرفة' })
    .press('Enter');
  await expect(page).toHaveURL(/\/admin$/);
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL(/\/signin$/);
}
async function choose(page: Page, category: string, version = 1) {
  await page
    .getByRole('button')
    .filter({ has: page.locator('strong', { hasText: category }) })
    .filter({ hasText: `مراجعة ${version}` })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'أي كوكب هو الأقرب إلى الشمس؟',
      exact: true,
    }),
  ).toBeVisible();
}
async function accessible(page: Page) {
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('editor, independent reviewer and publisher complete the Arabic revision workflow', async ({
  page,
}, info) => {
  const category = `تحرير ${info.project.name}`;
  await page.goto('/signin');
  await accessible(page);
  await page.screenshot({
    path: info.outputPath('signin.png'),
    fullPage: true,
  });
  await login(page, 'editor');
  await page.getByRole('button', { name: 'سؤال جديد', exact: true }).click();
  await page.getByLabel('التصنيف', { exact: true }).fill(category);
  await page
    .getByLabel('نص السؤال', { exact: true })
    .fill('أي كوكب هو الأقرب إلى الشمس؟');
  for (const [index, value] of ['عطارد', 'الأرض', 'المريخ', 'زحل'].entries())
    await page.getByLabel(`الخيار ${index + 1}`, { exact: true }).fill(value);
  await page
    .getByRole('textbox', { name: 'تفسير الإجابة', exact: true })
    .fill('عطارد أول الكواكب قربًا من الشمس.');
  await page.getByLabel('اسم المصدر 1', { exact: true }).fill('NASA');
  await page
    .getByLabel('رابط المصدر 1', { exact: true })
    .fill('https://science.nasa.gov/solar-system/planets/');
  await accessible(page);
  // A lost response after commit must retry with the same idempotency key.
  let lost = false;
  await page.route('**/api/content', async (route) => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await page.getByRole('button', { name: 'إعادة إرسال الطلب نفسه' }).click();
  await expect(page.getByRole('status')).toContainText('حُفظ الطلب');
  await page.unroute('**/api/content');
  await expect(
    page.locator('.content-question-list strong', { hasText: category }),
  ).toHaveCount(1);
  await choose(page, category);
  await expect(
    page.getByText('لا يمكنك مراجعة مسودة ألّفتها.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'اعتماد المراجعة' }),
  ).toHaveCount(0);
  await accessible(page);
  const cookies = await page.context().cookies();
  expect(
    cookies.some(
      (cookie) =>
        cookie.name.startsWith('mm-auth') &&
        cookie.httpOnly &&
        cookie.sameSite === 'Lax',
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('mm-auth');
  expect(
    await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain('access_token');
  await logout(page);
  await login(page, 'reviewer');
  await choose(page, category);
  await page
    .getByLabel('ملاحظة المراجعة', { exact: true })
    .fill('تحققت من المصدر والصياغة والإجابة في هذا الاختبار المحلي.');
  await page
    .getByRole('button', { name: 'اعتماد المراجعة', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('حُفظ الطلب');
  await choose(page, category);
  await expect(page.locator('.content-detail .content-status')).toHaveText(
    'مُراجَع',
  );
  await expect(
    page.getByRole('button', { name: 'نشر السؤال', exact: true }),
  ).toHaveCount(0);
  await logout(page);
  await login(page, 'publisher');
  await choose(page, category);
  await page.getByRole('button', { name: 'نشر السؤال', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('حُفظ الطلب');
  await choose(page, category);
  await expect(page.locator('.content-detail .content-status')).toHaveText(
    'منشور',
  );
  await accessible(page);
  await page.screenshot({
    path: info.outputPath('published.png'),
    fullPage: true,
  });
  await logout(page);
  await login(page, 'editor');
  await choose(page, category);
  await page.getByRole('button', { name: 'إنشاء مراجعة معدّلة' }).click();
  await page
    .getByRole('textbox', { name: 'تفسير الإجابة', exact: true })
    .fill('تفسير محدّث في مراجعة جديدة، مع بقاء النسخة المنشورة محفوظة.');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('حُفظ الطلب');
  await expect(
    page.locator('.content-question-list strong', { hasText: category }),
  ).toHaveCount(2);
  await choose(page, category, 1);
  await expect(page.locator('.content-detail .content-status')).toHaveText(
    'منشور',
  );
  await logout(page);
  await login(page, 'publisher');
  await choose(page, category, 1);
  await page
    .getByLabel('سبب إيقاف النشر', { exact: true })
    .fill('إيقاف اختباري بعد التحقق من المسار.');
  await page
    .getByRole('button', { name: 'إيقاف نشر السؤال', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('حُفظ الطلب');
  await page.reload();
  await choose(page, category, 1);
  await expect(page.locator('.content-detail .content-status')).toHaveText(
    'متوقف',
  );
  await logout(page);
  expect(
    (await page.context().cookies()).filter((cookie) =>
      cookie.name.startsWith('mm-auth'),
    ),
  ).toHaveLength(0);
});

test('session refresh, denied access, CSRF and role revocation keep editorial data private', async ({
  page,
}) => {
  await page.request.post('http://127.0.0.1:49002/revoke-ordinary');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/signin$/);
  expect(await page.content()).not.toContain('سؤال تحرير خاص للاختبار');
  await page
    .getByLabel('البريد الإلكتروني')
    .fill(CONTENT_ACCOUNTS.editor.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'دخول إلى دار المعرفة' }).click();
  await expect(page.locator('.content-error[role="alert"]')).toContainText(
    'تعذّر تسجيل الدخول',
  );
  await login(page, 'ordinary');
  await expect(
    page.getByRole('heading', { name: 'لا توجد صلاحيات محتوى لهذا الحساب' }),
  ).toBeVisible();
  await accessible(page);
  expect(await page.content()).not.toContain('سؤال تحرير خاص للاختبار');
  expect((await page.request.get('/api/content?view=list')).status()).toBe(403);
  const csrf = await page.request.post('/api/auth/signout', {
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  await page.request.post('http://127.0.0.1:49002/grant-ordinary');
  await page.getByRole('button', { name: 'التحقق من الصلاحيات' }).click();
  await expect(
    page.getByRole('button', { name: 'سؤال جديد', exact: true }),
  ).toBeVisible();
  await page.request.post('http://127.0.0.1:49002/revoke-ordinary');
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'لا توجد صلاحيات محتوى لهذا الحساب' }),
  ).toBeVisible();
  await logout(page);
  // URL changes before the workspace's initial authenticated reads finish.
  // Wait for those reads before replacing cookies, so a deliberately empty
  // cookie interval cannot race an old request into a sign-in redirect.
  const reviewerLoaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/content' &&
      url.searchParams.get('view') === 'list' &&
      response.status() === 200
    );
  });
  await login(page, 'reviewer');
  await reviewerLoaded;
  await expect(
    page.getByRole('button', { name: 'تحديث', exact: true }),
  ).toBeEnabled();
  const before = (await (
    await page.request.get('http://127.0.0.1:49002/stats')
  ).json()) as { refreshes: number };
  const cookies = await page.context().cookies();
  const authCookies = cookies
    .filter(
      (cookie) =>
        cookie.name === 'mm-auth' || cookie.name.startsWith('mm-auth.'),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const raw = authCookies.map((cookie) => cookie.value).join('');
  expect(raw.startsWith('base64-')).toBe(true);
  const session = JSON.parse(
    Buffer.from(raw.slice(7), 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
  // Force the stored expiry hint, not a signed JWT, without timing sleeps.
  session.expires_at = 1;
  await page.context().clearCookies({ name: /^mm-auth(?:\..*)?$/ });
  await page.context().addCookies([
    {
      ...authCookies[0]!,
      name: 'mm-auth',
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    },
  ]);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'أسئلة تصنع الفارق.' }),
  ).toBeVisible();
  const after = (await (
    await page.request.get('http://127.0.0.1:49002/stats')
  ).json()) as { refreshes: number };
  expect(after.refreshes).toBeGreaterThan(before.refreshes);
  const bad = await page.request.post('/api/content', {
    headers: {
      Origin: 'http://127.0.0.1:3101',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'injection',
    },
    data: {
      type: 'PUBLISH',
      questionId: '00000000-0000-4000-8000-000000000001',
      revision: 1,
      actor: 'publisher',
    },
  });
  expect(bad.status()).toBe(400);
  await logout(page);
  await page.context().addCookies([
    {
      name: 'mm-auth',
      value: 'base64-invalid',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/signin$/);
  expect(await page.content()).not.toContain('سؤال تحرير خاص للاختبار');
});
