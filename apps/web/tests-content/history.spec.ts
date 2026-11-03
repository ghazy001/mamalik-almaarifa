import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONTENT_ACCOUNTS } from '../../game-server/tests/support/content-accounts';
test('private history paginates, retries safely and clears results after sign-out or account changes', async ({
  page,
}, info) => {
  const origin = 'http://127.0.0.1:3101';
  async function login(account: 'historian' | 'emptyPlayer') {
    await page.goto('/account');
    await page
      .getByLabel('البريد الإلكتروني')
      .fill(CONTENT_ACCOUNTS[account].email);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill(CONTENT_ACCOUNTS[account].password);
    await page
      .getByRole('button', { name: 'دخول إلى المملكة', exact: true })
      .click();
    await expect(page).toHaveURL(/\/online\?account=1$/);
  }
  await page.goto('/history');
  await expect(page.getByRole('status')).toContainText('سجّل الدخول');
  expect((await page.request.get('/api/history')).status()).toBe(401);
  await login('historian');
  await page.goto('/history');
  await expect(page.locator('[data-history-match]')).toHaveCount(20);
  await expect(page.locator('[data-history-match]').first()).toHaveAttribute(
    'data-history-match',
    'm_browser_history_20',
  );
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.locator('[data-history-match]')).toHaveCount(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('history.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'الصفحة التالية', exact: true })
    .click();
  await expect(page.locator('[data-history-match]')).toHaveCount(1);
  await expect(page.locator('[data-history-match]')).toHaveAttribute(
    'data-history-match',
    'm_browser_history_00',
  );
  await expect(
    page.getByRole('button', { name: 'الصفحة التالية', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'الصفحة السابقة', exact: true })
    .click();
  await expect(page.locator('[data-history-match]')).toHaveCount(20);
  expect((await page.request.get('/api/history?subject=victim')).status()).toBe(
    400,
  );
  expect(
    (await page.request.get('/api/history?cursor=a&cursor=b')).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get('/api/history', {
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status(),
  ).toBe(403);
  await page.route('**/api/history**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"private SQL canary"}',
    }),
  );
  await page.getByRole('button', { name: 'تحديث السجل', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تعذّر تحميل السجل');
  await expect(page.locator('[data-history-match]')).toHaveCount(0);
  expect(await page.content()).not.toContain('private SQL canary');
  await page.unroute('**/api/history**');
  await page.getByRole('button', { name: 'تحديث السجل', exact: true }).click();
  await expect(page.locator('[data-history-match]')).toHaveCount(20);
  const result = await page.request.get('/api/history');
  expect(result.headers()['cache-control']).toContain('no-store');
  expect(await result.text()).not.toMatch(
    /issuer|subject|bankHash|seed|question|token/,
  );
  expect(
    (
      await page.request.post('/api/auth/signout', {
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'تحديث السجل', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('سجّل الدخول');
  await expect(page.locator('[data-history-match]')).toHaveCount(0);
  await login('emptyPlayer');
  await page.goto('/history');
  await expect(page.getByRole('status')).toContainText('لا توجد مباريات');
  expect(await page.content()).not.toContain('m_browser_history');
  await page.screenshot({
    path: info.outputPath('history-empty.png'),
    fullPage: true,
  });
});
