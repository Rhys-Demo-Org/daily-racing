// B11 · Four track cards fit the 844×390 phone: in Chromium, the 'start--menu' stage keeps every card
// and RACE inside the viewport, no card overlaps RACE, and no card's name or best text is clipped.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const inside = (b: Box, w: number, h: number): boolean => b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('B11 track select fits the phone', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'track-select-fit-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC10: at 844×390 all four cards and RACE are on screen, no card overlaps RACE, no name or best is clipped', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 844, height: 390, touch: true });
    const page = await renderStage(ctx, origin, 'start--menu');
    const radios = page.getByRole('radio');
    expect(await radios.count()).toBe(4);
    const race = await page.getByRole('button', { name: 'Race' }).boundingBox();
    if (!race) throw new Error('no RACE box');
    expect(inside(race, 844, 390)).toBe(true);
    for (const radio of await radios.all()) {
      const box = await radio.boundingBox();
      if (!box) throw new Error('no card box');
      expect(inside(box, 844, 390)).toBe(true);
      expect(overlap(box, race)).toBe(false);
      // The card's name and its BEST line: the text-bearing leaves of the card.
      const texts = await radio.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>('span')]
          .filter((s) => s.children.length === 0 && (s.textContent ?? '').trim() !== '')
          .map((s) => ({ text: s.textContent ?? '', scroll: s.scrollWidth, client: s.clientWidth, rightEdge: s.getBoundingClientRect().right, cardRight: el.getBoundingClientRect().right })),
      );
      expect(texts.some((t) => t.text.startsWith('BEST'))).toBe(true);
      expect(texts.length).toBeGreaterThanOrEqual(2);
      for (const t of texts) {
        expect(t.scroll, t.text).toBeLessThanOrEqual(t.client);
        expect(t.rightEdge, t.text).toBeLessThanOrEqual(t.cardRight);
      }
    }
    assertNoErrors(page, 'start--menu');
    await ctx.close();
  }, 60_000);
});
