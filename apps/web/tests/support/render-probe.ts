import type { Page } from '@playwright/test';

interface RenderProbe {
  territoryTextDraws: number;
  longTasks: { start: number; duration: number }[];
  largestContentfulPaintMs: number | null;
  canvasClears: number;
  drawCalls: number;
  selectionFrameMs: number[];
}
declare global {
  interface Window {
    mamalikRenderProbe: RenderProbe;
  }
}

/** Test-only observation; leaves actual canvas drawing, clocks and gameplay intact. */
export async function observeRendering(page: Page, cpuRate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.addInitScript(() => {
    window.mamalikRenderProbe = {
      territoryTextDraws: 0,
      longTasks: [],
      largestContentfulPaintMs: null,
      canvasClears: 0,
      drawCalls: 0,
      selectionFrameMs: [],
    };
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (/^[٠-٩]{2}$/u.test(text))
        window.mamalikRenderProbe.territoryTextDraws++;
      return draw.call(this, text, ...args);
    };
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const clear = prototype.clear;
      prototype.clear = function (...args) {
        if (
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.matches('.phaser-surface canvas')
        )
          window.mamalikRenderProbe.canvasClears++;
        return clear.apply(this, args);
      };
      for (const method of ['drawArrays', 'drawElements'] as const) {
        const draw = prototype[method];
        prototype[method] = function (mode, count, type, offset?: number) {
          if (
            this.canvas instanceof HTMLCanvasElement &&
            this.canvas.matches('.phaser-surface canvas')
          )
            window.mamalikRenderProbe.drawCalls++;
          // drawArrays has three arguments; its extra argument is ignored.
          return draw.call(this, mode, count, type, offset!);
        };
      }
    }
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.mamalikRenderProbe.longTasks.push({
            start: entry.startTime,
            duration: entry.duration,
          });
      }).observe({ type: 'longtask', buffered: true });
    if (
      PerformanceObserver.supportedEntryTypes.includes(
        'largest-contentful-paint',
      )
    )
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.mamalikRenderProbe.largestContentfulPaintMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  return cdp;
}

export async function sampleFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        count: number;
        p95Ms: number;
        maxMs: number;
        elapsedMs: number;
        canvasClears: number;
        drawCalls: number;
      }>((resolve) => {
        const intervals: number[] = [];
        let previous: number | null = null;
        const started = performance.now();
        const clears = window.mamalikRenderProbe.canvasClears;
        const draws = window.mamalikRenderProbe.drawCalls;
        const frame = (now: number) => {
          if (previous !== null) intervals.push(now - previous);
          previous = now;
          if (intervals.length < 120) requestAnimationFrame(frame);
          else {
            intervals.sort((a, b) => a - b);
            resolve({
              count: intervals.length,
              p95Ms: intervals[Math.ceil(intervals.length * 0.95) - 1]!,
              maxMs: intervals.at(-1)!,
              elapsedMs: performance.now() - started,
              canvasClears: window.mamalikRenderProbe.canvasClears - clears,
              drawCalls: window.mamalikRenderProbe.drawCalls - draws,
            });
          }
        };
        requestAnimationFrame(frame);
      }),
  );
}
