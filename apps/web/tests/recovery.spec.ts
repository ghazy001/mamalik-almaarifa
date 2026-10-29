import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installSocketFaults } from './support/socket-faults';
import { findFixture } from '../src/features/match/questions';

test.use({
  actionTimeout: 10000,
  trace: {
    mode: 'retain-on-failure',
    snapshots: false,
    screenshots: false,
    sources: true,
  },
});

test('a closed question offers keyboard-reachable manual recovery inside the dialog', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60000);
  const use = testInfo.project.use;
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL: 'http://127.0.0.1:3100',
        viewport: use.viewport ?? { width: 1440, height: 1000 },
        hasTouch: use.hasTouch ?? false,
        isMobile: use.isMobile ?? false,
        reducedMotion: use.reducedMotion ?? 'no-preference',
      }),
    ),
  );
  const pages = [
    page,
    ...(await Promise.all(contexts.map((context) => context.newPage()))),
  ];
  const faults = new Map(
    await Promise.all(
      pages.map(
        async (client) => [client, await installSocketFaults(client)] as const,
      ),
    ),
  );
  const errors: string[] = [];
  for (const client of pages)
    client.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/online');
    await page.getByLabel('اسمك في المباراة').fill('مملكة المنار');
    await page
      .getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true })
      .click();
    const invite = page.getByLabel('رمز الغرفة', { exact: true });
    await expect(invite).toHaveValue(/^[a-f0-9]{16}$/);
    const code = await invite.inputValue();
    for (const [index, guest] of pages.slice(1).entries()) {
      await guest.goto(`/online?room=${code}`);
      await guest
        .getByLabel('اسمك في المباراة')
        .fill(index ? 'مملكة الأفق' : 'مملكة النور');
      await guest
        .getByRole('button', { name: 'انضم إلى الغرفة', exact: true })
        .click();
    }
    for (const client of pages)
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'LOBBY',
      );
    await Promise.all(
      pages.map((client) =>
        client.getByRole('button', { name: 'أنا جاهز', exact: true }).click(),
      ),
    );
    await expect(page.locator('.online-match')).toHaveAttribute(
      'data-phase',
      'ATTACK_SELECTION',
    );
    const actorId = await page
      .locator('.online-match')
      .getAttribute('data-active-player-id');
    let actor = page;
    for (const client of pages)
      if (
        (await client
          .locator('.online-match')
          .getAttribute('data-player-id')) === actorId
      )
        actor = client;
    const root = actor.locator('.online-match');
    await actor.locator('[data-legal="true"]').first().click();
    await actor
      .getByRole('button', { name: 'ابدأ التحدّي', exact: true })
      .click();
    const dialog = actor.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    const questionId = await dialog.getAttribute('data-question-id');
    const deadline = await root.getAttribute('data-question-deadline');
    await faults.get(actor)!.stopAutomaticRecovery();
    await expect(root).toHaveAttribute('data-status', 'closed');
    const restore = dialog.getByRole('button', {
      name: 'استعادة الاتصال',
      exact: true,
    });
    await expect(restore).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: actor })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await actor.locator('#battle-heading').focus();
    await actor.keyboard.press('Tab');
    await expect(restore).toBeFocused();
    await expect(actor.locator('[data-choice-id]:enabled')).toHaveCount(0);
    await actor.screenshot({
      path: testInfo.outputPath('manual-recovery.png'),
      timeout: 10000,
    });
    await actor.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-status', 'connected');
    await expect(root).toHaveAttribute('data-player-id', actorId!);
    await expect(root).toHaveAttribute('data-question-deadline', deadline!);
    await expect(actor.locator('dialog[open]')).toHaveAttribute(
      'data-question-id',
      questionId!,
    );
    const choice = findFixture(questionId!).question.correctChoiceId;
    await actor.locator(`[data-choice-id="${choice}"]`).click();
    await expect(root).toHaveAttribute('data-phase', 'RESOLUTION');
    for (const guest of pages.filter((client) => client !== actor)) {
      await guest.keyboard.press('Escape');
      await guest
        .getByRole('button', { name: 'مغادرة الغرفة والاستسلام', exact: true })
        .click();
    }
    await expect(root).toHaveAttribute('data-phase', 'FINISHED');
    await Promise.all(
      contexts
        .filter((context) => context !== actor.context())
        .map((context) => context.close()),
    );
    await actor.bringToFront();
    expect(
      await actor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
