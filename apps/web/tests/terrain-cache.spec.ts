import { expect, test } from '@playwright/test';
import { findFixture } from '../src/features/match/questions';
import { observeRendering } from './support/render-probe';
import {
  GEOGRAPHY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../src/features/map/geography';

test('cached artwork survives context restoration and resizing without losing selection', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await observeRendering(page, 1);
  await page.goto('/map');
  const host = page.locator('.phaser-host');
  await expect(host).toHaveAttribute('data-render-state', 'ready');
  const target = page.locator('[data-legal="true"]').first();
  await target.focus();
  await page.keyboard.press('Enter');
  const selected = await host.getAttribute('data-selected-id');
  const canvas = page.locator('.phaser-surface canvas');
  await page.mouse.move(0, 0);
  const before = await canvas.screenshot();
  const draws = await page.evaluate(
    () => window.mamalikRenderProbe.territoryTextDraws,
  );
  // Exercise a real browser context reset, not a synthetic restore event.
  await canvas.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const canvas = element as HTMLCanvasElement;
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension)
          return reject(new Error('Context-loss extension absent'));
        canvas.addEventListener(
          'webglcontextlost',
          () => setTimeout(() => extension.restoreContext(), 100),
          { once: true },
        );
        canvas.addEventListener('webglcontextrestored', () => resolve(), {
          once: true,
        });
        extension.loseContext();
      }),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.mamalikRenderProbe.territoryTextDraws),
    )
    .toBeGreaterThan(draws);
  await expect(host).toHaveAttribute('data-selected-id', selected!);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
  const viewport = page.viewportSize()!;
  const labelsAfterRestore = await page.evaluate(
    () => window.mamalikRenderProbe.territoryTextDraws,
  );
  await page.setViewportSize({ width: 500, height: 700 });
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(viewport);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
  expect(
    await page.evaluate(() => window.mamalikRenderProbe.territoryTextDraws),
  ).toBe(labelsAfterRestore);
  await canvas.screenshot({ path: info.outputPath('terrain-restored.png') });
  await page.getByRole('link', { name: 'العودة إلى البداية' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'استكشف خريطة المملكة' }).click();
  await expect(host).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
  await cdp.detach();
});

for (const mode of ['WebGL cache', 'Canvas fallback']) {
  test(`${mode} paints a real capture and clears it on fresh practice`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Disable only WebGL; retain a functioning Canvas 2D renderer.
    if (mode === 'Canvas fallback')
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = new Proxy(original, {
          apply(
            target,
            canvas: HTMLCanvasElement,
            args: Parameters<HTMLCanvasElement['getContext']>,
          ) {
            if (args[0].includes('webgl')) return null;
            return Reflect.apply(target, canvas, args);
          },
        });
      });
    await page.goto('/learn');
    await expect(page.locator('.phaser-host')).toHaveAttribute(
      'data-render-state',
      'ready',
    );
    const canvas = page.locator('.phaser-surface canvas');
    expect(
      await canvas.evaluate(
        (element) => (element as HTMLCanvasElement).getContext('2d') !== null,
      ),
    ).toBe(mode === 'Canvas fallback');
    const target = page
      .locator('.learn-panel [data-territory-id]:enabled')
      .first();
    const id = await target.getAttribute('data-territory-id');
    const point = GEOGRAPHY[id!]!;
    // Sample the flag area, away from selection outlines, to detect ownership art.
    const flagImage = async () => {
      await canvas.scrollIntoViewIfNeeded();
      const bounds = (await canvas.boundingBox())!;
      return page.screenshot({
        clip: {
          x: bounds.x + ((point.x + 37) / WORLD_WIDTH) * bounds.width,
          y: bounds.y + ((point.y - 26) / WORLD_HEIGHT) * bounds.height,
          width: (25 / WORLD_WIDTH) * bounds.width,
          height: (28 / WORLD_HEIGHT) * bounds.height,
        },
      });
    };
    const before = await flagImage();
    const capture = async () => {
      await page
        .locator('.learn-panel [data-territory-id]:enabled')
        .first()
        .click();
      await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
      const dialog = page.locator('dialog[open]');
      const question = findFixture(
        (await dialog.getAttribute('data-question-id'))!,
      ).question;
      await dialog
        .locator(`[data-choice-id="${question.correctChoiceId}"]`)
        .click();
      await expect(
        page.getByText('أجبت إجابة صحيحة، فانتقلت الأرض إلى فيروز.', {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'تابع إلى طريقة الفوز' }).click();
    };
    await capture();
    const captured = await flagImage();
    expect(captured.equals(before)).toBe(false);
    await canvas.screenshot({ path: info.outputPath('terrain-capture.png') });
    await page.getByRole('button', { name: 'أعد التدريب' }).click();
    await expect(page.locator(`[data-territory-id="${id}"]`)).toHaveAttribute(
      'data-owner-id',
      '',
    );
    await expect(page.locator('canvas')).toHaveCount(1);
    expect((await flagImage()).equals(before)).toBe(true);
    if (mode === 'WebGL cache') {
      // A capture received while graphics are unavailable must appear on restore.
      await canvas.evaluate(
        (element) =>
          new Promise<void>((resolve, reject) => {
            const surface = element as HTMLCanvasElement & {
              restoreForTest?: () => void;
            };
            const gl =
              surface.getContext('webgl2') ?? surface.getContext('webgl');
            const extension = gl?.getExtension('WEBGL_lose_context');
            if (!extension)
              return reject(new Error('Context-loss extension absent'));
            surface.restoreForTest = () => extension.restoreContext();
            surface.addEventListener('webglcontextlost', () => resolve(), {
              once: true,
            });
            extension.loseContext();
          }),
      );
      await capture();
      await canvas.evaluate(
        (element) =>
          new Promise<void>((resolve) => {
            const surface = element as HTMLCanvasElement & {
              restoreForTest?: () => void;
            };
            surface.addEventListener('webglcontextrestored', () => resolve(), {
              once: true,
            });
            surface.restoreForTest!();
            delete surface.restoreForTest;
          }),
      );
      expect((await flagImage()).equals(captured)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
