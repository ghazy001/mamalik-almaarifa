import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONTENT_ACCOUNTS } from '../../game-server/tests/support/content-accounts';
test('private standing shows earned points, unranked accounts and safe retry/sign-out states', async ({
  page,
}, info) => {
  async function login(account: 'standingPlayer' | 'emptyPlayer') {
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
  await page.goto('/standing');
  await expect(page.getByRole('status')).toContainText('سجّل الدخول');
  expect((await page.request.get('/api/standing')).status()).toBe(401);
  await login('standingPlayer');
  await page.goto('/account');
  await page
    .getByRole('link', { name: 'ترتيبي الشخصي ←', exact: true })
    .click();
  await expect(page.locator('[data-standing-result]')).toHaveCount(1);
  await expect(page.locator('.standing-stats dd')).toHaveText([
    '١',
    '٣',
    '١',
    '١',
    '٠',
  ]);
  const response = await page.request.get('/api/standing');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({
    policyVersion: 'basic-v1',
    points: 3,
    position: 1,
    eligibleMatches: 1,
    soleWins: 1,
    sharedWins: 0,
  });
  expect(await page.content()).not.toMatch(
    /standing@fixture.invalid|00000000-0000-4000-8000-000000000007|bankHash|access_token/,
  );
  for (const query of [
    '?subject=victim',
    '?issuer=other',
    '?limit=100',
    '?subject=a&subject=b',
  ])
    expect((await page.request.get(`/api/standing${query}`)).status()).toBe(
      400,
    );
  expect(
    (
      await page.request.get('/api/standing', {
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status(),
  ).toBe(403);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('standing.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'تحديث الترتيب', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-standing-result]')).toHaveCount(1);
  await page.route('**/api/standing', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"private SQL canary"}',
    }),
  );
  await page
    .getByRole('button', { name: 'تحديث الترتيب', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('تعذّر تحميل الترتيب');
  await expect(page.locator('[data-standing-result]')).toHaveCount(0);
  expect(await page.content()).not.toContain('SQL canary');
  await page.unroute('**/api/standing');
  await page
    .getByRole('button', { name: 'تحديث الترتيب', exact: true })
    .click();
  await expect(page.locator('[data-standing-result]')).toHaveCount(1);
  expect(
    (
      await page.request.post('/api/auth/signout', {
        headers: {
          Origin: 'http://127.0.0.1:3101',
          'Content-Type': 'application/json',
        },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole('button', { name: 'تحديث الترتيب', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('سجّل الدخول');
  await expect(page.locator('[data-standing-result]')).toHaveCount(0);
  await login('emptyPlayer');
  await page.goto('/standing');
  await expect(page.getByRole('status')).toContainText('لم تُصنّف بعد');
  await expect(page.locator('.standing-stats dd')).toHaveText([
    '—',
    '٠',
    '٠',
    '٠',
    '٠',
  ]);
  await page.screenshot({
    path: info.outputPath('standing-unranked.png'),
    fullPage: true,
  });
});
