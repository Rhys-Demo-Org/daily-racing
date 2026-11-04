// R5-3: the keycap legend follows the desktop mode live on resize, like the HUD sizes (B05 "the mode
// updates live on resize"). Rendered in Chromium from a harness build, like the screenshots.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const DESKTOP = { width: 1440, height: 900, touch: false };

/** Whether the "Keyboard controls" group is on screen. */
function legendVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector('[role="group"][aria-label="Keyboard controls"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

describe('keycap legend on resize', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'keycap-resize-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('hides the legend when a first-lap desktop page shrinks below 1224×566, and shows it again when it grows back', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, DESKTOP);
    const page = await renderStage(ctx, origin, 'hud--first-lap');
    expect(await legendVisible(page)).toBe(true);
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(() => legendVisible(page)).toBe(false);
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await expect.poll(() => legendVisible(page)).toBe(true);

    // A small page that grows to desktop size gains the legend too.
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(() => legendVisible(page)).toBe(false);
    await ctx.close();

    const small = await context(browser, { width: 1000, height: 700, touch: false });
    const grown = await renderStage(small, origin, 'hud--first-lap');
    expect(await legendVisible(grown)).toBe(false);
    await grown.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await expect.poll(() => legendVisible(grown)).toBe(true);
    await small.close();
  }, 60_000);
});
