// Back on the menu after NEXT RACE (or QUIT TO MENU), the checked card must lie inside the card
// row, even on a phone narrow enough for the four-card row to scroll.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, GAME_READY, launch, open, serve } from '../../harness/screens/browser.ts';

describe('checked card visible on menu return', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'checked-card-in-row-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('the checked Pine Ridge card lies inside the row after showMenu at 600×360', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 600, height: 360, touch: true });
    await ctx.addInitScript(() => localStorage.setItem('racer.finished.hay-loop', '1'));
    const page = await open(ctx, origin, '/', GAME_READY);
    await page.evaluate(() => {
      const r = (window as unknown as { __racer: { startRace(o: { track: string; seed: number }): unknown; showMenu(): void } }).__racer;
      r.startRace({ track: 'pine-ridge', seed: 1 });
      r.showMenu();
    });
    const s = await page.getByRole('radiogroup').evaluate((row) => {
      const c = row.querySelector('[role="radio"][aria-checked="true"]');
      const rb = row.getBoundingClientRect();
      const cb = c?.getBoundingClientRect();
      return {
        id: c?.getAttribute('data-track-id'),
        scrollW: row.scrollWidth,
        clientW: row.clientWidth,
        pageScrollY: window.scrollY,
        row: [rb.left, rb.right],
        card: cb ? [cb.left, cb.right] : null,
      };
    });
    expect(s.id).toBe('pine-ridge');
    expect(s.scrollW).toBeGreaterThan(s.clientW);
    expect(s.pageScrollY).toBe(0);
    if (!s.card) throw new Error('no checked card');
    expect(s.card[0]).toBeGreaterThanOrEqual((s.row[0] ?? 0) - 0.5);
    expect(s.card[1]).toBeLessThanOrEqual((s.row[1] ?? 0) + 0.5);
    await ctx.close();
  }, 60_000);
});
