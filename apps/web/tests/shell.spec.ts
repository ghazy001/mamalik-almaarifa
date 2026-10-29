import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('Arabic shell is responsive, keyboard accessible, and honest about M1', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'المعرفة',
  );
  await expect(
    page.getByText('لم تُفتح الغرف أو المباريات عبر الإنترنت بعد.', {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain('Noto Sans Arabic');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'انتقل إلى المحتوى' }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'اكتشف قواعد المملكة' }).click();
  await expect(page).toHaveURL(/#rules$/);
  await expect(
    page.getByRole('link', { name: 'انتقل إلى المحتوى' }),
  ).not.toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors).toEqual([]);
  // Capture the complete page from its top; off-screen fixed skip links otherwise
  // appear inside Chromium's expanded full-page screenshot after anchor scrolling.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('shell.png'),
    fullPage: true,
  });
});
