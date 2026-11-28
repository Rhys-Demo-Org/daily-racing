// B14 · Many track cards (UI_RULES §12): in Chromium at 844×390, the 'track-select--many-cards' stage
// holds eight cards at the 96px minimum in a row that scrolls sideways with a snap point per card, no
// scrollbar and the next card peeking in, while RACE stays put and the page never scrolls sideways.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const STAGE = 'track-select--many-cards';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The card row (the radiogroup) and every radio's box, at the row's current scroll. */
async function rowState(page: Page): Promise<{ row: Box; radios: Box[]; scrollLeft: number; scrollWidth: number; clientWidth: number; docWidth: number }> {
  return page.getByRole('radiogroup').evaluate((row) => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      row: box(row),
      radios: [...row.querySelectorAll('[role="radio"]')].map(box),
      scrollLeft: row.scrollLeft,
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      docWidth: document.documentElement.scrollWidth,
    };
  });
}

const within = (b: Box, outer: Box): boolean => b.x >= outer.x - 0.5 && b.x + b.width <= outer.x + outer.width + 0.5;

describe('B14 track select with many cards', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'track-select-many-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC1: eight 96px radios in a scroll-snapping row with no scrollbar, the next card peeking in, every name whole', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 844, height: 390, touch: true });
    const page = await renderStage(ctx, origin, STAGE);
    const radios = page.getByRole('radio');
    expect(await radios.count()).toBe(8);

    const style = await page.getByRole('radiogroup').evaluate((row) => {
      const s = getComputedStyle(row);
      return { snapType: s.scrollSnapType, scrollbar: s.scrollbarWidth, aligns: [...row.querySelectorAll('[role="radio"]')].map((r) => getComputedStyle(r).scrollSnapAlign) };
    });
    expect(style.snapType).toMatch(/^x\b/);
    expect(style.scrollbar).toBe('none');
    expect(style.aligns).toHaveLength(8);
    for (const a of style.aligns) expect(a).not.toBe('none');

    const state = await rowState(page);
    expect(state.scrollLeft).toBe(0);
    expect(state.scrollWidth).toBeGreaterThan(state.clientWidth);
    for (const r of state.radios) expect(Math.abs(r.width - 96)).toBeLessThanOrEqual(0.5);
    // Peek: the first radio not wholly inside the row is still partly visible in it.
    const rowRight = state.row.x + state.row.width;
    const peek = state.radios.find((r) => !within(r, state.row));
    if (!peek) throw new Error('every card fits; nothing peeks');
    expect(peek.x).toBeLessThan(rowRight);
    expect(peek.x + peek.width).toBeGreaterThan(rowRight);

    // §12: names wrap, never clip. Every line of each name lies inside its card's border (the card
    // clips its overflow there); a long word may use the plate's padding but never passes the edge.
    for (const radio of await radios.all()) {
      const name = await radio.evaluate((el) => {
        const span = document.getElementById(el.getAttribute('aria-labelledby') ?? '');
        if (!span) throw new Error('no name');
        const range = document.createRange();
        range.selectNodeContents(span);
        const card = el.getBoundingClientRect();
        const lines = [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
        const inner = { left: card.left + el.clientLeft, right: card.left + el.clientLeft + el.clientWidth, top: card.top + el.clientTop, bottom: card.top + el.clientTop + el.clientHeight };
        return { text: span.textContent ?? '', lines, inner };
      });
      expect(name.lines.length, name.text).toBeGreaterThan(0);
      expect(name.lines.length, name.text).toBeLessThanOrEqual(2);
      for (const l of name.lines) {
        expect(l.left, name.text).toBeGreaterThanOrEqual(name.inner.left);
        expect(l.right, name.text).toBeLessThanOrEqual(name.inner.right);
        expect(l.top, name.text).toBeGreaterThanOrEqual(name.inner.top);
        expect(l.bottom, name.text).toBeLessThanOrEqual(name.inner.bottom);
      }
    }
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);

  it('AC2: scrolled to its end, the row shows the last card whole while RACE stays put and the page never scrolls sideways', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 844, height: 390, touch: true });
    const page = await renderStage(ctx, origin, STAGE);
    const race = page.getByRole('button', { name: 'Race' });
    const before = await race.boundingBox();
    if (!before) throw new Error('no RACE box');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);

    await page.getByRole('radiogroup').evaluate((row) => {
      row.scrollLeft = row.scrollWidth - row.clientWidth;
    });
    const state = await rowState(page);
    expect(state.scrollLeft).toBeGreaterThan(0);
    expect(Math.abs(state.scrollLeft - (state.scrollWidth - state.clientWidth))).toBeLessThanOrEqual(1);

    const after = await race.boundingBox();
    if (!after) throw new Error('no RACE box');
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - before[k]), k).toBeLessThanOrEqual(0.5);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(844);
    expect(after.y + after.height).toBeLessThanOrEqual(390);

    const last = state.radios[state.radios.length - 1];
    if (!last) throw new Error('no cards');
    expect(within(last, state.row)).toBe(true);
    expect(state.docWidth).toBeLessThanOrEqual(844);
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);
});
