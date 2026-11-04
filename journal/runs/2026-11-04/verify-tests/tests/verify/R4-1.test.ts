// R4-1: on desktop (the only place keycaps render) UI_RULES §3 asks for 4px outlines.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

describe('R4-1 keycap outlines on desktop', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'r4-1-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('every keycap in the desktop legend has a 4px outline', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, 'hud--first-lap');
    const widths = await page.evaluate(() => [...document.querySelectorAll('.ui-keycap')].map((k) => getComputedStyle(k).borderTopWidth));
    await ctx.close();
    expect(widths).toHaveLength(5);
    expect(new Set(widths)).toEqual(new Set(['4px']));
  }, 60_000);
});
