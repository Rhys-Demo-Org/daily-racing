// R4-2: the scrolling card row must not paint a peeking card into the right safe-area inset (UI_RULES §5:
// right inset max(48px, env(safe-area-inset-right))) at 844×390.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

describe('R4-2 card row stays out of the right safe inset', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';
  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'verify-r4-2-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('no part of a card is visible right of 844 − 48 px at scroll 0', async () => {
    if (!browser) throw new Error('no browser');
    const page = await renderStage(await context(browser, { width: 844, height: 390, touch: true }), origin, 'track-select--many-cards');
    const s = await page.getByRole('radiogroup').evaluate((row) => {
      const clip = row.getBoundingClientRect().right;
      const race = [...document.querySelectorAll('button')].find((b) => /race/i.test(b.textContent ?? ''))!.getBoundingClientRect().right;
      const visibleRight = Math.max(...[...row.querySelectorAll('[role="radio"]')].map((c) => Math.min(c.getBoundingClientRect().right, clip)));
      return { clip, race, visibleRight };
    });
    console.log(JSON.stringify(s));
    expect(s.visibleRight).toBeLessThanOrEqual(844 - 48 + 0.5);
  }, 60_000);
});
