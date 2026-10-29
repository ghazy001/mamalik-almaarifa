import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { findFixture } from '../src/features/match/questions';

test('a complete offline match supports answers, captures, results and a fresh replay', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  let sockets = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', () => {
    sockets++;
  });
  await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') });
  await page.goto('/');
  await page.getByRole('link', { name: 'العب مباراة محلية' }).click();
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'ready',
    { timeout: 30000 },
  );
  await page.clock.pauseAt(new Date('2026-10-29T12:05:00Z'));
  const root = page.locator('.local-match');
  await expect(root).toHaveAttribute('data-phase', 'LOBBY');
  const oldMatchId = await root.getAttribute('data-match-id');
  await page.getByRole('button', { name: 'ابدأ المباراة المحلية' }).click();
  await expect(root).toHaveAttribute('data-phase', 'ATTACK_SELECTION');
  const target = page.locator('[data-territory-id][data-legal="true"]').first();
  const targetId = await target.getAttribute('data-territory-id');
  await target.click();
  await page.getByRole('button', { name: 'ابدأ التحدّي', exact: true }).click();
  let dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveAttribute('data-resolved', 'false');
  await expect(page.locator('[data-correct="true"]')).toHaveCount(0);
  await expect(page.locator('#battle-heading')).toBeFocused();
  const firstQuestion = await dialog.getAttribute('data-question-id');
  const right = findFixture(firstQuestion!).question.correctChoiceId;
  await dialog.locator(`[data-choice-id="${right}"]`).click();
  await expect(root).toHaveAttribute('data-phase', 'RESOLUTION');
  await expect(dialog).toHaveAttribute('data-resolved', 'true');
  await expect(dialog.locator('[data-correct="true"]')).toHaveCount(1);
  await expect(
    page.locator(`[data-territory-id="${targetId}"]`),
  ).toHaveAttribute('data-owner-id', 'p_teal');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'إعادة فتح المواجهة' }).click();
  await page.getByRole('button', { name: 'متابعة الدور التالي' }).click();

  let guard = 0;
  while (
    (await root.getAttribute('data-phase')) !== 'FINISHED' &&
    guard++ < 250
  ) {
    const phase = await root.getAttribute('data-phase');
    if (
      phase === 'ATTACK_SELECTION' &&
      (await root.getAttribute('data-human-turn')) === 'true'
    ) {
      await page
        .locator('[data-territory-id][data-legal="true"]')
        .first()
        .click();
      await page
        .getByRole('button', { name: 'ابدأ التحدّي', exact: true })
        .click();
    } else if (phase === 'DUEL') {
      dialog = page.locator('dialog[open]');
      const enabled = dialog.locator('[data-choice-id]:enabled');
      if (await enabled.count()) {
        const questionId = await dialog.getAttribute('data-question-id');
        await dialog
          .locator(
            `[data-choice-id="${findFixture(questionId!).question.correctChoiceId}"]`,
          )
          .click();
      } else await page.clock.fastForward(6500);
    } else if (phase === 'RESOLUTION')
      await page.getByRole('button', { name: 'متابعة الدور التالي' }).click();
    else await page.clock.fastForward(1000);
  }
  await expect(root).toHaveAttribute('data-phase', 'FINISHED');
  await expect(
    page.getByRole('heading', { name: 'انتهت المباراة', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.match-placements li')).toHaveCount(3);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(sockets).toBe(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // axe uses asynchronous timers. Resume them only after the match is finished.
  await page.clock.resume();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('results.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'مباراة جديدة' }).click();
  await expect(root).toHaveAttribute('data-phase', 'LOBBY');
  await expect(root).not.toHaveAttribute('data-match-id', oldMatchId!);
  await expect(root).toHaveAttribute('data-turn', '0');
  await expect(
    page.locator('[data-territory-id][data-owner-id="p_teal"]'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'ابدأ المباراة المحلية' }).click();
  await expect(root).toHaveAttribute('data-turn', '1');
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('the live question dialog supports keyboard focus, RTL and accessible answer controls', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/play');
  await page.getByRole('button', { name: 'ابدأ المباراة المحلية' }).click();
  await page.locator('[data-territory-id][data-legal="true"]').first().click();
  await page.getByRole('button', { name: 'ابدأ التحدّي', exact: true }).click();
  await expect(page.locator('#battle-heading')).toBeFocused();
  await expect(page.locator('dialog[open] [data-choice-id]')).toHaveCount(4);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('question.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'إعادة فتح المواجهة' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('question deadlines continue while minimized and the DOM works without canvas', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') });
  await page.goto('/play');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'fallback',
    { timeout: 30000 },
  );
  await page.clock.pauseAt(new Date('2026-10-29T12:05:00Z'));
  await page.getByRole('button', { name: 'ابدأ المباراة المحلية' }).click();
  const target = page.locator('[data-territory-id][data-legal="true"]').first();
  const targetId = await target.getAttribute('data-territory-id');
  await target.click();
  await page.getByRole('button', { name: 'ابدأ التحدّي', exact: true }).click();
  await page.getByRole('button', { name: 'تصغير المواجهة' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.clock.fastForward(15001);
  await expect(page.locator('.local-match')).toHaveAttribute(
    'data-phase',
    'RESOLUTION',
  );
  await expect(page.locator('dialog[open]')).toHaveAttribute(
    'data-resolved',
    'true',
  );
  await expect(
    page.getByText('انتهت المهلة دون إجابة منك.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-territory-id="${targetId}"]`),
  ).toHaveAttribute('data-owner-id', '');
  await expect(page.locator('[data-correct="true"]')).toHaveCount(1);
});
