// B05: the race HUD switches to desktop layout (desktop type sizes, 32px margins, 4px outlines) on a
// fine-pointer viewport of at least 1224×566, live on resize, and keeps the phone layout on touch.
// Rendered in Chromium from a harness build, like the screenshots (harness/screens).
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const DESKTOP = { width: 1440, height: 900, touch: false };
const PHONE = { width: 844, height: 390, touch: true };

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface HudSnapshot {
  posSize: string;
  lapSize: string;
  labelSizes: string[];
  outlines: string[];
  pos: Box;
  pause: Box;
  touchVisible: boolean;
  legendVisible: boolean;
}

/** Computed sizes and boxes of the HUD widgets AC1 names. */
function snapshot(page: Page): Promise<HudSnapshot> {
  return page.evaluate(() => {
    const q = (sel: string): Element => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const legend = document.querySelector('[role="group"][aria-label="Keyboard controls"]');
    return {
      posSize: getComputedStyle(q('.ui-hud-pos__n')).fontSize,
      lapSize: getComputedStyle(q('.ui-hud-lap .ui-value')).fontSize,
      labelSizes: [...document.querySelectorAll('.ui-hud .ui-label')].map((el) => getComputedStyle(el).fontSize),
      outlines: ['.ui-hud-pos', '.ui-hud-lap', '.ui-hud-time'].map((sel) => getComputedStyle(q(sel)).borderTopWidth),
      pos: box(q('.ui-hud-pos')),
      pause: box(q('.ui-hud-pause')),
      touchVisible: [...document.querySelectorAll('.ui-tc')].some(shown),
      legendVisible: legend !== null && shown(legend),
    };
  });
}

describe('desktop race HUD', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'desktop-hud-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC1: at 1440×900 without touch the HUD uses desktop sizes, 4px outlines and 32px margins; the phone keeps its sizes', async () => {
    if (!browser) throw new Error('no browser');
    const desk = await context(browser, DESKTOP);
    const d = await snapshot(await renderStage(desk, origin, 'hud--mid-race'));
    await desk.close();
    expect(d.posSize).toBe('64px');
    expect(d.lapSize).toBe('40px');
    expect(d.labelSizes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(d.labelSizes)).toEqual(new Set(['16px']));
    expect(d.outlines).toEqual(['4px', '4px', '4px']);
    expect(d.pos.left).toBe(32);
    expect(d.pos.top).toBe(32);
    expect(DESKTOP.width - d.pause.right).toBe(32);
    expect(d.touchVisible).toBe(false);

    const phone = await context(browser, PHONE);
    const p = await snapshot(await renderStage(phone, origin, 'hud--mid-race'));
    await phone.close();
    expect(p.posSize).toBe('44px');
    expect(p.outlines).toEqual(['3px', '3px', '3px']);
    expect(p.touchVisible).toBe(true);
  }, 60_000);

  it('AC2: resizing a desktop page below 1224×566 switches to phone sizes live, and back', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, DESKTOP);
    const page = await renderStage(ctx, origin, 'hud--mid-race');
    const pos = (): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector('.ui-hud-pos__n') as Element).fontSize);
    expect(await pos()).toBe('64px');
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(pos).toBe('44px');
    expect((await snapshot(page)).outlines).toEqual(['3px', '3px', '3px']);
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await expect.poll(pos).toBe('64px');
    await ctx.close();
  }, 60_000);

  it('AC6: the first-lap stage shows the keycap legend on desktop only, never on touch or a small viewport', async () => {
    if (!browser) throw new Error('no browser');
    const desk = await context(browser, DESKTOP);
    const d = await snapshot(await renderStage(desk, origin, 'hud--first-lap'));
    await desk.close();
    expect(d.legendVisible).toBe(true);
    expect(d.posSize).toBe('64px');

    const phone = await context(browser, PHONE);
    expect((await snapshot(await renderStage(phone, origin, 'hud--first-lap'))).legendVisible).toBe(false);
    await phone.close();

    const small = await context(browser, { width: 1000, height: 700, touch: false });
    expect((await snapshot(await renderStage(small, origin, 'hud--first-lap'))).legendVisible).toBe(false);
    await small.close();
  }, 60_000);
});
