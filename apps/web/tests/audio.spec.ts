import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { findFixture } from '../src/features/match/questions';

test.beforeEach(async ({ page }) => {
  // Observe real decoded Web Audio playback, without replacing Howler or its output.
  await page.addInitScript(() => {
    Reflect.set(window, 'cueStarts', []);
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if ((this.buffer?.duration ?? 0) > 1)
        Reflect.get(window, 'cueStarts').push(args[1] ?? 0);
      return start.apply(this, args);
    };
  });
});

test('sound is opt-in, adjustable by keyboard, shared with the dialog and independent of outcomes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const assets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/audio/')) assets.push(request.url());
  });
  await page.goto('/learn');
  const controls = page.locator('.game-audio').first();
  await expect(controls).toHaveAttribute('data-audio-status', 'muted');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'ready',
    { timeout: 30000 },
  );
  expect(assets).toEqual([]);
  await controls.getByRole('button', { name: 'تشغيل الصوت' }).focus();
  await page.keyboard.press('Enter');
  await expect(controls).toHaveAttribute('data-audio-status', 'on');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'cueStarts')))
    .toEqual([0]);
  expect(assets).toHaveLength(1);
  const volume = controls.getByRole('slider', { name: 'مستوى الصوت' });
  await volume.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('25');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('audio-controls.png'),
    fullPage: true,
  });
  await page
    .locator('.learn-panel [data-territory-id]:enabled')
    .first()
    .click();
  await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
  const dialog = page.locator('dialog[open]');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'cueStarts')))
    .toEqual([0, 0.9]);
  const modalControls = dialog.locator('.game-audio');
  await expect(modalControls).toHaveAttribute('data-audio-status', 'on');
  const modalVolume = modalControls.getByRole('slider', {
    name: 'مستوى الصوت',
  });
  await expect(modalVolume).toHaveValue('25');
  await modalVolume.focus();
  await page.keyboard.press('Home');
  await expect(volume).toHaveValue('0');
  const question = findFixture(
    (await dialog.getAttribute('data-question-id'))!,
  ).question;
  await dialog
    .locator(`[data-choice-id="${question.correctChoiceId}"]`)
    .click();
  await expect(page.locator('.learn-practice')).toHaveAttribute(
    'data-phase',
    'RESOLUTION',
  );
  await expect(dialog.locator('[data-correct="true"]')).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, 'cueStarts'))).toEqual([
    0, 0.9,
  ]);
  await modalVolume.focus();
  await page.keyboard.press('End');
  await expect(volume).toHaveValue('100');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('audio-dialog.png'),
    fullPage: false,
  });
  await modalControls.getByRole('button', { name: 'كتم الصوت' }).click();
  await page.getByRole('button', { name: 'تابع إلى طريقة الفوز' }).click();
  await expect(controls).toHaveAttribute('data-audio-status', 'muted');
  expect(await page.evaluate(() => Reflect.get(window, 'cueStarts'))).toEqual([
    0, 0.9,
  ]);
  await page.reload();
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'muted',
  );
  expect(errors).toEqual([]);
});

test('asset failure is recoverable and does not block practice or start audio on navigation', async ({
  page,
}) => {
  await page.route('**/audio/kingdom-cues.wav', (route) => route.abort());
  await page.goto('/learn');
  await page.getByRole('button', { name: 'تشغيل الصوت' }).click();
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'error',
  );
  await expect(
    page.getByText('تعذّر تشغيل الصوت.', { exact: false }),
  ).toBeVisible();
  await page.unroute('**/audio/kingdom-cues.wav');
  await page.getByRole('button', { name: 'تشغيل الصوت' }).click();
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'on',
  );
  // Simulate a visibility notification; physical-device interruption testing remains manual.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'muted',
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'muted',
  );
  await page.getByRole('link', { name: 'تجاوز التدريب والعب' }).click();
  await expect(page.locator('.game-audio')).toHaveAttribute(
    'data-audio-status',
    'muted',
  );
  await expect(page.locator('.local-match')).toHaveAttribute(
    'data-phase',
    'LOBBY',
  );
  await page.getByRole('button', { name: 'ابدأ المباراة المحلية' }).click();
  await expect(page.locator('.local-match')).toHaveAttribute(
    'data-phase',
    'ATTACK_SELECTION',
  );
});
