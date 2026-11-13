// R4-1 · Track cards press like every other control (UI_RULES §10: "Pressed = sink onto a 1px
// shadow"; board 05 #7: press-sink, then the fill cuts to mustard). And, like .ui-button, the hover
// lift only exists where there is real hover, so on a phone a tapped card doesn't stay raised.
// The real menu stage runs in Chromium; the card's settled transform and shadow are read from the page.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, launch, renderStage, serve } from '../../harness/screens/browser.ts';
import { TRACKS } from '../../src/content/tracks.ts';

/** The card's transform offset (px, x then y) and box-shadow offset once transitions have run. */
async function pose(page: Page, name: string): Promise<{ dx: number; dy: number; shadow: number }> {
  return page.getByRole('radio', { name: new RegExp(name) }).evaluate((el) => {
    for (const a of document.getAnimations()) a.finish();
    const s = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform);
    const offsets = (s.boxShadow.match(/(-?[\d.]+)px/g) ?? []).map((v) => parseFloat(v));
    return { dx: m.m41, dy: m.m42, shadow: offsets[0] ?? 0 };
  });
}

describe('R4-1 track card pressed state', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';
  const name = TRACKS[TRACKS.length - 1]?.name ?? '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'track-card-press-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('a pressed card sinks toward its shadow (positive offset, shadow smaller than at rest)', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, 'start--menu');
    const rest = await pose(page, name);
    const box = await page.getByRole('radio', { name: new RegExp(name) }).boundingBox();
    if (!box) throw new Error('no card box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await pose(page, name);
    await page.mouse.up();
    assertNoErrors(page, 'menu');
    await ctx.close();
    expect(pressed.dx).toBeGreaterThan(0);
    expect(pressed.dy).toBeGreaterThan(0);
    expect(pressed.shadow).toBeLessThan(rest.shadow);
  }, 60_000);

  it('on a touch screen a tapped card does not stay lifted', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 844, height: 390, touch: true });
    const page = await renderStage(ctx, origin, 'start--menu');
    const rest = await pose(page, name);
    const card = page.getByRole('radio', { name: new RegExp(name) });
    await card.tap();
    // The tap's :active ends a moment later; :hover stays on the tapped card (that is the bug's case).
    await page.waitForTimeout(300);
    expect(await card.evaluate((el) => [el.matches(':hover'), el.matches(':active')])).toEqual([true, false]);
    const after = await pose(page, name);
    assertNoErrors(page, 'menu');
    await ctx.close();
    expect(after).toEqual(rest);
  }, 60_000);
});
