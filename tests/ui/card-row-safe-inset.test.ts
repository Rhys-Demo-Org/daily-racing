// R4-2: the scrolling card row must not paint a peeking card into the right safe-area inset
// (UI_RULES §5). Its clip edge stops at the content edge, aligned with RACE.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

describe('card row stays out of the right safe inset', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';
  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'card-row-safe-inset-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  const sizes = [
    { width: 844, height: 390, touch: true },
    { width: 1440, height: 900, touch: false },
  ];
  for (const size of sizes) {
    it(`no card is visible right of RACE's right edge at ${size.width}×${size.height}`, async () => {
      if (!browser) throw new Error('no browser');
      const page = await renderStage(await context(browser, size), origin, 'track-select--many-cards');
      const s = await page.getByRole('radiogroup').evaluate((row) => {
        const clip = row.getBoundingClientRect().right;
        const race = [...document.querySelectorAll('button')]
          .find((b) => /race/i.test(b.textContent ?? ''))!
          .getBoundingClientRect().right;
        const visibleRight = Math.max(
          ...[...row.querySelectorAll('[role="radio"]')].map((c) => Math.min(c.getBoundingClientRect().right, clip)),
        );
        return { race, visibleRight };
      });
      expect(s.visibleRight).toBeLessThanOrEqual(s.race + 0.5);
      if (size.width === 844) expect(s.visibleRight).toBeLessThanOrEqual(844 - 48 + 0.5);
    }, 60_000);
  }
});
