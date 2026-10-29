import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  GEOGRAPHY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../src/features/map/geography';

test('map pointer/touch and DOM keyboard selection share one legal state', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'استكشف خريطة المملكة' }).click();
  await expect(page).toHaveURL(/\/map$/);
  const host = page.locator('.phaser-host');
  await expect(host).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30000,
  });
  await expect(page.locator('canvas')).toHaveCount(1);
  const legal = page.locator('[data-territory-id][data-legal="true"]');
  await expect(legal).toHaveCount(2);
  await expect(page.locator('[data-territory-id]')).toHaveCount(15);
  await expect(page.locator('[data-territory-id]:disabled')).toHaveCount(13);
  const firstId = await legal.nth(0).getAttribute('data-territory-id');
  const secondId = await legal.nth(1).getAttribute('data-territory-id');
  if (!firstId || !secondId) throw new Error('Missing legal targets');
  const touchTarget = await legal.nth(0).boundingBox();
  expect(touchTarget!.height).toBeGreaterThanOrEqual(44);
  await legal.nth(0).focus();
  await page.keyboard.press('Space');
  await expect(legal.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(host).toHaveAttribute('data-selected-id', firstId);
  await page.getByRole('button', { name: 'مسح الاختيار' }).click();
  await expect(host).toHaveAttribute('data-selected-id', '');

  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const point = GEOGRAPHY[secondId]!;
  const x = bounds.x + (point.x / WORLD_WIDTH) * bounds.width;
  const y = bounds.y + (point.y / WORLD_HEIGHT) * bounds.height;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x, y);
    await expect(host).toHaveAttribute('data-hovered-id', secondId);
    await page.mouse.click(x, y);
  }
  await expect(host).toHaveAttribute('data-selected-id', secondId);
  await expect(legal.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('لم تتغيّر ملكيتها.', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('map.png'),
    fullPage: true,
  });
  // Client navigation must remove the old Phaser instance before mounting again.
  await page.getByRole('link', { name: 'العودة إلى البداية' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'استكشف خريطة المملكة' }).click();
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'ready',
  );
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-selected-id',
    '',
  );
  expect(errors).toEqual([]);
});

test('DOM selection remains available when the canvas renderer cannot initialize', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/map');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'fallback',
    { timeout: 30000 },
  );
  const legal = page.locator('[data-territory-id][data-legal="true"]').first();
  await legal.click();
  await expect(legal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('الهدف المختار', { exact: true })).toBeVisible();
});
