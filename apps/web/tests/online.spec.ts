import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MAP } from '@mamalik/game-core';
import { findFixture } from '../src/features/match/questions';
import { installSocketFaults } from './support/socket-faults';
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

test('three browsers finish the same match through lost frames, in-question reconnect, reload and frozen-tab recovery', async ({
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
  const faults = new Map(
    await Promise.all(
      pages.map(
        async (client) => [client, await installSocketFaults(client)] as const,
      ),
    ),
  );
  for (const client of pages)
    client.on('pageerror', (error) => errors.push(error.message));
  try {
    // Both admission modes share the same authority. Finish a queued desktop
    // match and invited portrait/landscape matches without duplicating CI time.
    const queue = testInfo.project.name === 'desktop';
    await page.goto('/online');
    await page
      .getByLabel('اسمك في المباراة')
      .fill('GhaziPlayerWithoutSpacesForLayoutCoverage'.slice(0, 40));
    await page
      .getByRole('button', {
        name: queue ? 'ابحث عن لاعبين' : 'أنشئ غرفة خاصة',
        exact: true,
      })
      .click();
    let code = '';
    if (queue) {
      await expect(page.locator('.online-queue-status')).toContainText(
        '١ من ٣',
      );
      await expect(page.getByLabel('رمز الغرفة', { exact: true })).toHaveCount(
        0,
      );
    } else {
      const invite = page.getByLabel('رمز الغرفة', { exact: true });
      await expect(invite).toHaveValue(/^[a-f0-9]{16}$/);
      code = await invite.inputValue();
    }
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
      await guest.goto(queue ? '/online' : `/online?room=${code}`);
      if (!queue)
        await expect(guest.getByLabel('رمز الدعوة')).toHaveValue(code);
      await guest
        .getByLabel('اسمك في المباراة')
        .fill(index ? 'مملكة الأفق' : 'مملكة النور');
      await guest
        .getByRole('button', {
          name: queue ? 'ابحث عن لاعبين' : 'انضم إلى الغرفة',
          exact: true,
        })
        .click();
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
    let recoveredQuestion = false;
    let recoveredReload = false;
    let recoveredFrozen = false;
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
      battles++;
      if (battles === 1) {
        expect(
          (
            await new AxeBuilder({ page: current })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        await current.screenshot({ path: testInfo.outputPath('question.png') });
      }
      const deadline = await current
        .locator('.online-match')
        .getAttribute('data-question-deadline');
      if (battles === 2) {
        const transport = faults.get(current)!;
        await transport.drop();
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-status',
          'reconnecting',
        );
        await expect(
          current.locator('dialog[open] .battle-guidance'),
        ).toContainText(/انقطع الاتصال|نستعيد حالة/);
        await expect(current.locator('[data-choice-id]:enabled')).toHaveCount(
          0,
        );
        await current.screenshot({
          path: testInfo.outputPath('reconnecting.png'),
        });
        transport.resume();
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-status',
          'connected',
        );
        await expect(current.locator('dialog[open]')).toHaveAttribute(
          'data-question-id',
          questionId!,
        );
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-question-deadline',
          deadline!,
        );
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-player-id',
          actor!,
        );
        recoveredQuestion = true;
      }
      let frozen: { page: Page; resume: () => Promise<void> } | null = null;
      if (battles === 3) {
        await current.reload();
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-status',
          'connected',
        );
        await expect(current.locator('dialog[open]')).toHaveAttribute(
          'data-question-id',
          questionId!,
        );
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-question-deadline',
          deadline!,
        );
        recoveredReload = true;
        for (const observer of pages.filter((client) => client !== current)) {
          if (await observer.locator('[data-choice-id]:enabled').count())
            continue;
          const cdp = await observer.context().newCDPSession(observer);
          await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
          frozen = {
            page: observer,
            resume: async () => {
              await cdp.send('Page.setWebLifecycleState', { state: 'active' });
              await cdp.detach();
            },
          };
          break;
        }
        expect(frozen).not.toBeNull();
      }
      const transport = faults.get(current)!;
      const replayOld = battles === 1 ? transport.captureSnapshot() : null;
      if (battles === 1) {
        transport.suppress(true);
        transport.duplicateNextCommand();
      }
      await current.locator(`[data-choice-id="${correct}"]`).click();
      for (const client of pages.filter((client) => client !== current)) {
        if (client === frozen?.page) continue;
        const answer = client.locator(`[data-choice-id="${correct}"]:enabled`);
        if (await answer.count()) await answer.click();
      }
      if (battles === 1) {
        const witness = pages.find((client) => client !== current)!;
        await expect(witness.locator('.online-match')).toHaveAttribute(
          'data-phase',
          /RESOLUTION|FINISHED/,
        );
        expect(transport.stats().suppressed).toBeGreaterThan(0);
        expect(transport.stats().duplicated).toBe(1);
        // Watch DOM sequence monotonicity while old/duplicate frames arrive.
        await current
          .locator('.online-match')
          .evaluate((element: HTMLElement) => {
            let previous = Number(element.dataset.sequence);
            element.dataset.sequenceRegressed = 'false';
            new MutationObserver(() => {
              const next = Number(element.dataset.sequence);
              if (next < previous) element.dataset.sequenceRegressed = 'true';
              previous = next;
            }).observe(element, {
              attributes: true,
              attributeFilter: ['data-sequence'],
            });
          });
        transport.suppress(false);
        await current.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-phase',
          /RESOLUTION|ATTACK_SELECTION|FINISHED/,
        );
        const sequence = Number(
          await current.locator('.online-match').getAttribute('data-sequence'),
        );
        replayOld!();
        replayOld!();
        await current.evaluate(() =>
          window.dispatchEvent(new Event('pageshow')),
        );
        await expect
          .poll(
            async () =>
              Number(
                await current
                  .locator('.online-match')
                  .getAttribute('data-sequence'),
              ),
            { timeout: 7000 },
          )
          .toBeGreaterThan(sequence);
        await expect(current.locator('.online-match')).toHaveAttribute(
          'data-sequence-regressed',
          'false',
        );
      }
      const progressing =
        frozen?.page === page ? current.locator('.online-match') : root;
      if (battles !== 1)
        await expect(progressing).toHaveAttribute(
          'data-phase',
          /RESOLUTION|FINISHED/,
        );
      // Server owns the three-second review interval; clients have no Continue command.
      await expect(progressing).toHaveAttribute(
        'data-phase',
        /ATTACK_SELECTION|FINISHED/,
        { timeout: 20000 },
      );
      if (frozen) {
        const turn = await progressing.getAttribute('data-turn');
        await frozen.resume();
        await frozen.page.bringToFront();
        await expect(frozen.page.locator('.online-match')).toHaveAttribute(
          'data-turn',
          turn!,
        );
        await expect(frozen.page.locator('.online-match')).toHaveAttribute(
          'data-phase',
          /ATTACK_SELECTION|FINISHED/,
        );
        recoveredFrozen = true;
      }
    }
    for (const client of pages) {
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'FINISHED',
      );
      await expect(client.locator('.match-placements li')).toHaveCount(3);
      await expect(
        client.locator('[data-result-storage="disabled"]'),
      ).toHaveText('الحفظ الدائم غير مفعّل لهذه المباراة.');
      await expect(client.locator('#online-results-title')).toBeFocused();
    }
    expect(battles).toBeGreaterThan(0);
    expect({ recoveredQuestion, recoveredReload, recoveredFrozen }).toEqual({
      recoveredQuestion: true,
      recoveredReload: true,
      recoveredFrozen: true,
    });
    const result = await page.locator('.match-placements').innerText();
    for (const client of pages)
      expect(await client.locator('.match-placements').innerText()).toBe(
        result,
      );
    // All three results are verified. Release guest renderers after the frozen
    // tab case before axe opens its helper page in the surviving context.
    await Promise.all(contexts.map((context) => context.close()));
    await page.bringToFront();
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
    await page.locator('.match-results').screenshot({
      path: testInfo.outputPath('results.png'),
      timeout: 10000,
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

test('queue shows real occupancy, cancels and replaces seats, and never displays invite controls', async ({
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
  const guests = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const pages = [page, ...guests];
  const errors: string[] = [];
  for (const client of pages)
    client.on('pageerror', (error) => errors.push(error.message));
  async function search(client: Page, name: string) {
    await client.goto('/online');
    await client.getByLabel('اسمك في المباراة').fill(name);
    await client
      .getByRole('button', { name: 'ابحث عن لاعبين', exact: true })
      .click();
    await expect(client.locator('.online-match')).toHaveAttribute(
      'data-room-mode',
      'matchmaking',
    );
  }
  try {
    await search(page, 'مملكة المنار');
    await expect(page.locator('.online-queue-status')).toContainText('١ من ٣');
    await expect(
      page.getByRole('button', { name: 'أنا جاهز', exact: true }),
    ).toBeDisabled();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await search(guests[0]!, 'المقعد الملغى');
    await expect(page.locator('.online-queue-status')).toContainText('٢ من ٣');
    await guests[0]!
      .getByRole('button', { name: 'إلغاء البحث', exact: true })
      .click();
    await expect(guests[0]!.locator('.online-match')).toHaveAttribute(
      'data-status',
      'idle',
    );
    await expect(page.locator('.online-queue-status')).toContainText('١ من ٣');
    await guests[0]!.getByLabel('اسمك في المباراة').fill('مملكة البديل');
    await guests[0]!
      .getByRole('button', { name: 'ابحث عن لاعبين', exact: true })
      .click();
    await expect(page.locator('.online-queue-status')).toContainText('٢ من ٣');
    await expect(
      page.locator('.match-faction-name').filter({ hasText: 'المقعد الملغى' }),
    ).toHaveCount(0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath('queue-waiting.png'),
      fullPage: true,
    });
    await search(guests[1]!, 'مملكة الأفق');
    const root = page.locator('.online-match');
    await expect(root).toHaveAttribute('data-phase', 'LOBBY');
    const matchId = (await root.getAttribute('data-match-id'))!;
    for (const client of pages) {
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-match-id',
        matchId,
      );
      await expect(client.locator('.match-faction')).toHaveCount(3);
      await expect(
        client.getByLabel('رمز الغرفة', { exact: true }),
      ).toHaveCount(0);
      await expect(
        client.getByRole('button', { name: 'أنا جاهز', exact: true }),
      ).toBeEnabled();
      expect(
        await client.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(client.locator('html')).toHaveAttribute('dir', 'rtl');
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath('queue-ready.png'),
      fullPage: true,
    });
    await guests[1]!
      .getByRole('button', { name: 'مغادرة الغرفة والاستسلام', exact: true })
      .click();
    for (const client of [page, guests[0]!]) {
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'FINISHED',
      );
      await expect(
        client.getByText('أُلغيت المباراة دون فائز.', { exact: true }),
      ).toBeVisible();
      await client
        .getByRole('button', { name: 'العودة إلى الغرف', exact: true })
        .click();
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
