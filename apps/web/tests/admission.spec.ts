import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ROOM_ADMISSION_ERRORS } from '@mamalik/shared';

// HTTP failures are injected here to exercise presentation; real admission and
// published matches use PostgreSQL + real sockets in test:room-bank.
test('bank admission failures are readable, retryable and never expose upstream details', async ({
  page,
}, info) => {
  let code: string = ROOM_ADMISSION_ERRORS.CONTENT_BANK_INSUFFICIENT;
  await page.route('**/matchmake/**', (route) => {
    const preflight = route.request().method() === 'OPTIONS';
    return route.fulfill({
      status: preflight ? 204 : 503,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: preflight ? '' : JSON.stringify({ code: 503, error: code }),
    });
  });
  await page.goto('/online');
  await page.getByLabel('اسمك في المباراة').fill('معرفة');
  await page
    .getByRole('button', { name: 'ابحث عن لاعبين', exact: true })
    .click();
  await expect(page.locator('.match-notice[role="alert"]')).toContainText(
    'مكتبة الأسئلة المنشورة غير كافية',
  );
  await expect(
    page.getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true }),
  ).toBeEnabled();
  code = ROOM_ADMISSION_ERRORS.CONTENT_BANK_UNAVAILABLE;
  await page
    .getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true })
    .click();
  await expect(page.locator('.match-notice[role="alert"]')).toContainText(
    'مكتبة الأسئلة غير متاحة',
  );
  code = ROOM_ADMISSION_ERRORS.CONTENT_BANK_INVALID;
  await page
    .getByRole('button', { name: 'ابحث عن لاعبين', exact: true })
    .click();
  await expect(page.locator('.match-notice[role="alert"]')).toContainText(
    'تعذّر التحقق من مكتبة الأسئلة',
  );
  code = 'private SQL / credentials';
  await page
    .getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true })
    .click();
  await expect(page.locator('.match-notice[role="alert"]')).toContainText(
    'تعذّر الاتصال',
  );
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(await page.content()).not.toContain('private SQL');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Avoid a fixed off-screen skip-link artifact in expanded Chromium captures.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('admission.png'),
    fullPage: true,
  });
});
