import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MAP } from '@mamalik/game-core';
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

// Test driver chooses from visible legal controls; it never mutates server state.
async function chooseTarget(page: Page, playerId: string) {
  const root = page.locator('.online-match');
  const scope = await root.evaluate((element: HTMLElement) => ({
    turn: element.dataset.turn,
    active: element.dataset.activePlayerId,
    phase: element.dataset.phase,
  }));
  const turn = scope.turn;
  if (scope.active !== playerId || scope.phase !== 'ATTACK_SELECTION')
    return false;
  const controls = await page
    .locator('[data-territory-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-territory-id')!,
        owner: element.getAttribute('data-owner-id') ?? '',
        legal: element.getAttribute('data-legal') === 'true',
      })),
    );
  const owners = Object.fromEntries(
    controls.map((node) => [node.id, node.owner]),
  );
  const destinations = MAP.filter(
    (node) => node.castle && owners[node.id] !== playerId,
  );
  function distance(id: string) {
    const queue: [string, number][] = [[id, 0]];
    const seen = new Set<string>();
    while (queue.length) {
      const [next, length] = queue.shift()!;
      if (destinations.some((node) => node.id === next)) return length;
      if (seen.has(next)) continue;
      seen.add(next);
      for (const neighbor of MAP.find((node) => node.id === next)!.neighbors)
        queue.push([neighbor, length + 1]);
    }
    return Infinity;
  }
  const legal = controls.filter((node) => node.legal).map((node) => node.id);
  const target = legal.sort(
    (a, b) => distance(a) - distance(b) || a.localeCompare(b),
  )[0]!;
  try {
    if (!target) throw new Error('No visible legal target for the active seat');
    await page.locator(`[data-territory-id="${target}"]`).click();
    await page
      .getByRole('button', { name: 'ابدأ التحدّي', exact: true })
      .click();
    await page.waitForFunction(
      (selectedTurn) => {
        const element = document.querySelector<HTMLElement>('.online-match');
        return (
          element &&
          (element.dataset.turn !== selectedTurn ||
            element.dataset.phase !== 'ATTACK_SELECTION')
        );
      },
      turn,
      { timeout: 5000 },
    );
    return (
      (await root.getAttribute('data-turn')) === turn &&
      (await root.getAttribute('data-phase')) === 'DUEL'
    );
  } catch (error) {
    // A real server deadline can pass while a slow CI browser scrolls. Observe
    // the new turn instead of clicking an expired action or extending its timer.
    if ((await root.getAttribute('data-turn')) !== turn) return false;
    const phase = await root.getAttribute('data-phase');
    if (phase === 'DUEL') return true;
    if (phase === 'FINISHED' || phase === 'RESOLUTION') return false;
    throw error;
  }
}

test('three separate browsers join a private room, reconnect and finish the same authoritative match', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const use = testInfo.project.use;
  const options = {
    baseURL: 'http://127.0.0.1:3100',
    viewport: use.viewport ?? { width: 1440, height: 1000 },
    hasTouch: use.hasTouch ?? false,
    isMobile: use.isMobile ?? false,
    reducedMotion: use.reducedMotion ?? ('no-preference' as const),
  };
  const contexts = await Promise.all([
    browser.newContext(options),
    browser.newContext(options),
  ]);
  const pages = [
    page,
    await contexts[0]!.newPage(),
    await contexts[1]!.newPage(),
  ];
  const errors: string[] = [];
  for (const client of pages)
    client.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/online');
    await page
      .getByLabel('اسمك في المباراة')
      .fill('GhaziPlayerWithoutSpacesForLayoutCoverage'.slice(0, 40));
    await page.getByRole('button', { name: 'أنشئ غرفة خاصة' }).click();
    const invite = page.getByLabel('رمز الغرفة', { exact: true });
    await expect(invite).toHaveValue(/^[a-f0-9]{16}$/);
    const code = await invite.inputValue();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('lobby.png'),
      fullPage: true,
    });
    for (const [index, guest] of pages.slice(1).entries()) {
      await guest.goto(`/online?room=${code}`);
      await expect(guest.getByLabel('رمز الدعوة')).toHaveValue(code);
      await guest
        .getByLabel('اسمك في المباراة')
        .fill(index ? 'مملكة الأفق' : 'مملكة النور');
      await guest.getByRole('button', { name: 'انضم إلى الغرفة' }).click();
    }
    for (const client of pages)
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'LOBBY',
      );
    // Reload destroys the old socket; the per-tab token must reclaim exactly its seat.
    await pages[1]!.reload();
    await expect(pages[1]!.locator('.online-match')).toHaveAttribute(
      'data-status',
      'connected',
    );
    await expect(pages[1]!.locator('.online-match')).toHaveAttribute(
      'data-player-id',
      'p_blue',
    );
    await expect(pages[1]!.locator('.online-match')).toHaveAttribute(
      'data-match-id',
      (await page.locator('.online-match').getAttribute('data-match-id'))!,
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
    const byId: Record<string, Page> = {
      p_teal: page,
      p_blue: pages[1]!,
      p_gold: pages[2]!,
    };
    let battles = 0;
    for (let guard = 0; guard < 45; guard++) {
      const root = page.locator('.online-match');
      if ((await root.getAttribute('data-phase')) === 'FINISHED') break;
      await expect(root).toHaveAttribute(
        'data-phase',
        /ATTACK_SELECTION|FINISHED/,
        { timeout: 20000 },
      );
      if ((await root.getAttribute('data-phase')) === 'FINISHED') break;
      const actor = await root.getAttribute('data-active-player-id');
      const current = byId[actor!];
      if (!current) throw new Error('Missing active transport seat');
      await expect(current.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'ATTACK_SELECTION',
      );
      if (!(await chooseTarget(current, actor!))) continue;
      for (const client of pages)
        await expect(client.locator('dialog[open]')).toHaveAttribute(
          'data-resolved',
          'false',
        );
      const questionId = await current
        .locator('dialog[open]')
        .getAttribute('data-question-id');
      const correct = findFixture(questionId!).question.correctChoiceId;
      if (!battles++) {
        expect(
          (
            await new AxeBuilder({ page: current })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        await current.screenshot({ path: testInfo.outputPath('question.png') });
      }
      await current.locator(`[data-choice-id="${correct}"]`).click();
      for (const client of pages.filter((client) => client !== current)) {
        const answer = client.locator(`[data-choice-id="${correct}"]:enabled`);
        if (await answer.count()) await answer.click();
      }
      await expect(root).toHaveAttribute('data-phase', /RESOLUTION|FINISHED/);
      // Server owns the three-second review interval; clients have no Continue command.
      await expect(root).toHaveAttribute(
        'data-phase',
        /ATTACK_SELECTION|FINISHED/,
        { timeout: 20000 },
      );
    }
    for (const client of pages) {
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'FINISHED',
      );
      await expect(client.locator('.match-placements li')).toHaveCount(3);
      await expect(client.locator('#online-results-title')).toBeFocused();
    }
    expect(battles).toBeGreaterThan(0);
    const result = await page.locator('.match-placements').innerText();
    for (const client of pages)
      expect(await client.locator('.match-placements').innerText()).toBe(
        result,
      );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath('results.png'),
      fullPage: true,
    });
    // Inspect scripts actually loaded by /online, including framework prefetches.
    const scripts = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.includes('/_next/') && /\.js(?:\?|$)/.test(url)),
    );
    for (const url of scripts)
      expect(await (await page.request.get(url)).text()).not.toContain(
        'q_space_1',
      );
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
