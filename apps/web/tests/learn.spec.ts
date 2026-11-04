import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { findFixture } from '../src/features/match/questions';

test('guided practice teaches a legal capture, winning rules, replay and optional entry', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  let sockets = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', () => sockets++);
  await page.clock.install({ time: new Date('2026-11-04T12:00:00Z') });
  await page.goto('/');
  await page
    .getByRole('link', { name: 'جديد على المملكة؟ تعلّم اللعب بخطوة قصيرة' })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'ready',
    { timeout: 30000 },
  );
  await page.clock.pauseAt(new Date('2026-11-04T12:05:00Z'));
  const practice = page.locator('.learn-practice');
  const startId = await practice.getAttribute('data-match-id');
  await expect(practice).toHaveAttribute('data-phase', 'ATTACK_SELECTION');
  await page.clock.fastForward(60000);
  await expect(practice).toHaveAttribute('data-phase', 'ATTACK_SELECTION');
  const target = page
    .locator('.learn-panel [data-territory-id]:enabled')
    .first();
  const targetId = await target.getAttribute('data-territory-id');
  await expect(
    page.locator('.learn-panel [data-territory-id]:enabled'),
  ).toHaveCount(2);
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('learn-selection.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
  await expect(page.locator('#battle-heading')).toBeFocused();
  const dialog = page.locator('dialog[open]');
  const questionId = await dialog.getAttribute('data-question-id');
  await expect(dialog.locator('[data-correct="true"]')).toHaveCount(0);
  const choice = findFixture(questionId!).question.correctChoiceId;
  await dialog.locator(`[data-choice-id="${choice}"]`).click();
  await expect(practice).toHaveAttribute('data-phase', 'RESOLUTION');
  await expect(dialog.locator('[data-correct="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'تابع إلى طريقة الفوز' }).click();
  await expect(practice).toHaveAttribute('data-phase', 'FINISHED');
  await expect(
    page.getByRole('heading', { name: 'أصبحت تعرف خطوتك الأولى.' }),
  ).toBeFocused();
  await expect(
    page.getByText('احمِ قلعة بدايتك', { exact: true }),
  ).toBeVisible();
  await page.getByText('المبارزة والتعادل', { exact: true }).click();
  await expect(
    page.getByText('التعادل التام يعني صدارة مشتركة.', { exact: false }),
  ).toBeVisible();
  await page.clock.resume();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('learn-complete.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'أعد التدريب' }).click();
  await expect(practice).not.toHaveAttribute('data-match-id', startId!);
  await expect(practice).toHaveAttribute('data-phase', 'ATTACK_SELECTION');
  await expect(
    page.locator(`[data-territory-id="${targetId}"]`),
  ).toHaveAttribute('data-owner-id', '');
  await page.getByRole('link', { name: 'تجاوز التدريب والعب' }).click();
  await expect(page.locator('.local-match')).toHaveAttribute(
    'data-phase',
    'LOBBY',
  );
  expect(sockets).toBe(0);
  expect(errors).toEqual([]);
});

test('practice works without canvas and a wrong answer starts a genuinely fresh retry', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/learn');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'fallback',
    { timeout: 30000 },
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .locator('.learn-panel [data-territory-id]:enabled')
    .first()
    .click();
  await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
  const dialog = page.locator('dialog[open]');
  const question = findFixture(
    (await dialog.getAttribute('data-question-id'))!,
  ).question;
  const wrong = question.choices.find(
    (choice) => choice.id !== question.correctChoiceId,
  )!.id;
  await dialog.locator(`[data-choice-id="${wrong}"]`).click();
  await expect(
    page.getByText('إجابتك غير صحيحة.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.learn-practice')).toHaveAttribute(
    'data-phase',
    'RESOLUTION',
  );
  await page.getByRole('button', { name: 'تابع إلى طريقة الفوز' }).click();
  await page.getByRole('button', { name: 'أعد التدريب' }).click();
  await expect(
    page.locator('.learn-panel [data-territory-id]:enabled'),
  ).toHaveCount(2);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('learn-fallback.png'),
    fullPage: true,
  });
});

test('practice answer deadline continues after minimizing and remains keyboard accessible', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-04T12:00:00Z') });
  await page.goto('/learn');
  await page.clock.pauseAt(new Date('2026-11-04T12:05:00Z'));
  await page
    .locator('.learn-panel [data-territory-id]:enabled')
    .first()
    .click();
  await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'إعادة فتح المواجهة' }),
  ).toBeVisible();
  await page.clock.fastForward(15001);
  await expect(page.locator('.learn-practice')).toHaveAttribute(
    'data-phase',
    'RESOLUTION',
  );
  await expect(
    page.getByText('انتهت المهلة دون إجابة منك.', { exact: true }),
  ).toBeVisible();
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
