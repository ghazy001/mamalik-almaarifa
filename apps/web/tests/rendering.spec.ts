import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from '@colyseus/sdk';
import { writeFile } from 'node:fs/promises';
import { observeRendering, sampleFrames } from './support/render-probe';

test('production rendering profile keeps terrain stable across real room syncs', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const rate = info.project.name === 'desktop' ? 1 : 4;
  const cdp = await observeRendering(page, rate);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/map');
  await expect(page.locator('.phaser-host')).toHaveAttribute(
    'data-render-state',
    'ready',
    { timeout: 30000 },
  );
  const mapReadyAt = await page.evaluate(() => performance.now());
  for (let index = 0; index < 6; index++) {
    const target = page.locator('[data-legal="true"]').nth(index % 2);
    await target.evaluate((element) => {
      element.addEventListener(
        'click',
        () => {
          const started = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.mamalikRenderProbe.selectionFrameMs.push(
                performance.now() - started,
              );
            }),
          );
        },
        { once: true },
      );
    });
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() =>
        page.evaluate(() => window.mamalikRenderProbe.selectionFrameMs.length),
      )
      .toBe(index + 1);
  }
  const mapFrames = await sampleFrames(page);
  expect(mapFrames.canvasClears).toBeGreaterThan(0);
  expect(mapFrames.drawCalls).toBeGreaterThan(0);
  expect(mapFrames.drawCalls / mapFrames.canvasClears).toBeLessThanOrEqual(4);
  await page.locator('.phaser-surface canvas').screenshot({
    path: info.outputPath('board.png'),
  });
  const mapReport = await page.evaluate(
    ({ rate, mapReadyAt, mapFrames }) => ({
      cpuSlowdown: rate,
      mapReadyObservedMs: mapReadyAt,
      frames: mapFrames,
      ...window.mamalikRenderProbe,
      firstContentfulPaintMs:
        performance.getEntriesByName('first-contentful-paint')[0]?.startTime ??
        null,
      resources: performance
        .getEntriesByType('resource')
        .filter(
          (entry): entry is PerformanceResourceTiming =>
            entry instanceof PerformanceResourceTiming,
        )
        .map(({ name, transferSize, decodedBodySize }) => ({
          path: new URL(name).pathname,
          transferSize,
          decodedBodySize,
        })),
    }),
    { rate, mapReadyAt, mapFrames },
  );
  const mapPath = info.outputPath('map-profile.json');
  await writeFile(mapPath, JSON.stringify(mapReport, null, 2));
  await info.attach('map-profile', {
    path: mapPath,
    contentType: 'application/json',
  });
  await page.goto('/online');
  await page.getByLabel('اسمك في المباراة').fill('مملكة القياس');
  await page
    .getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true })
    .click();
  const invite = page.getByLabel('رمز الغرفة', { exact: true });
  await expect(invite).toHaveValue(/^[a-f0-9]{16}$/);
  const code = await invite.inputValue();
  const client = new Client('http://127.0.0.1:2571');
  const peers = await Promise.all(
    ['النور', 'الأفق'].map(async (name) => {
      const room = await client.joinById(code, { name });
      room.onMessage('*', () => {});
      return room;
    }),
  );
  try {
    const root = page.locator('.online-match');
    await expect(root).toHaveAttribute('data-phase', 'LOBBY');
    await expect(page.locator('.phaser-host')).toHaveAttribute(
      'data-render-state',
      'ready',
      { timeout: 30000 },
    );
    const readyAt = await page.evaluate(() => performance.now());
    const start = await page.evaluate(
      () => window.mamalikRenderProbe.territoryTextDraws,
    );
    expect(start).toBeGreaterThanOrEqual(15);
    const sequence = await root.getAttribute('data-sequence');
    await expect(root).not.toHaveAttribute('data-sequence', sequence!, {
      timeout: 10000,
    });
    const frames = await sampleFrames(page);
    expect(frames.canvasClears).toBeGreaterThan(0);
    expect(frames.drawCalls).toBeGreaterThan(0);
    expect(frames.drawCalls / frames.canvasClears).toBeLessThanOrEqual(4);
    const report = await page.evaluate(
      ({ rate, readyAt, frames, start }) => ({
        cpuSlowdown: rate,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
        cacheDisabled: true,
        network: 'local loopback; no network throttling',
        mapReadyObservedMs: readyAt,
        firstContentfulPaintMs:
          performance.getEntriesByName('first-contentful-paint')[0]
            ?.startTime ?? null,
        ...window.mamalikRenderProbe,
        redundantTerritoryTextDraws:
          window.mamalikRenderProbe.territoryTextDraws - start,
        frames,
        resources: performance
          .getEntriesByType('resource')
          .filter(
            (entry): entry is PerformanceResourceTiming =>
              entry instanceof PerformanceResourceTiming,
          )
          .map(({ name, transferSize, decodedBodySize }) => ({
            path: new URL(name).pathname,
            transferSize,
            decodedBodySize,
          })),
      }),
      { rate, readyAt, frames, start },
    );
    const reportPath = info.outputPath('sync-profile.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await info.attach('sync-profile', {
      path: reportPath,
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(report.redundantTerritoryTextDraws).toBe(0);
  } finally {
    await Promise.all(peers.map((room) => room.leave()));
    await cdp.detach();
  }
});

test('Arabic quiz reflows at narrow width with long labels and 200% text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/learn');
  await page
    .locator('.learn-panel [data-territory-id]:enabled')
    .first()
    .click();
  await page.getByRole('button', { name: 'ابدأ السؤال التدريبي' }).click();
  const dialog = page.locator('dialog[open]');
  const originalSize = await dialog
    .locator('.battle-choice')
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  // Synthetic presentation-only stress content; no command or domain state is altered.
  await dialog.evaluate((element) => {
    element.querySelector('#battle-heading')!.textContent =
      'أيّ الخيارات التالية يصف انتقال المعرفة بين الحضارات، مع مراعاة اختلاف اللغات والمصادر؟';
    for (const label of element.querySelectorAll('.battle-choice-label bdi'))
      label.textContent =
        'مصطلحمعرفيطويلدونمسافاتلاختبارالتفافالنصالعربي0123456789';
    document.documentElement.style.fontSize = '200%';
  });
  const reflow = await dialog.evaluate((element) => ({
    contentWidth: element.scrollWidth,
    availableWidth: element.clientWidth,
    answerFontPx: parseFloat(
      getComputedStyle(element.querySelector('.battle-choice')!).fontSize,
    ),
  }));
  const reflowPath = info.outputPath('reflow.json');
  await writeFile(
    reflowPath,
    JSON.stringify({ ...reflow, originalSize }, null, 2),
  );
  await info.attach('reflow', {
    path: reflowPath,
    contentType: 'application/json',
  });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(reflow.answerFontPx).toBe(originalSize * 2);
  expect(
    await dialog.locator('.match-countdown strong').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rectangles = [...range.getClientRects()];
      return rectangles.every(
        (rect) => Math.abs(rect.top - rectangles[0]!.top) < 1,
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const choice of await dialog
    .getByRole('button', { name: /^الخيار/ })
    .all()) {
    const box = await choice.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('quiz-narrow-text.png') });
  await dialog.locator('.battle-choice').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('quiz-narrow-answer.png') });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'إعادة فتح المواجهة' }),
  ).toBeVisible();
});
