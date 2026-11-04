// B05: on desktop the minimap and PAUSE button are drawn at ×1.45 their phone size (UI_RULES §5).
// Rendered in Chromium from a harness build, like the screenshots (harness/screens).
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokens } from '@tokens';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const DESKTOP = { width: 1440, height: 900, touch: false };
const PHONE = { width: 844, height: 390, touch: true };

interface Size {
  width: number;
  height: number;
}

/** Rendered sizes of the minimap and PAUSE button. */
function sizes(page: Page): Promise<{ map: Size; pause: Size }> {
  return page.evaluate(() => {
    const size = (sel: string): Size => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    return { map: size('.ui-hud-map'), pause: size('.ui-hud-pause') };
  });
}

describe('desktop HUD scale', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'desktop-hud-scale-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC1: at 1440×900 the minimap and PAUSE button are ×1.45 their phone size', async () => {
    if (!browser) throw new Error('no browser');
    const desk = await context(browser, DESKTOP);
    const d = await sizes(await renderStage(desk, origin, 'hud--mid-race'));
    await desk.close();
    const phone = await context(browser, PHONE);
    const p = await sizes(await renderStage(phone, origin, 'hud--mid-race'));
    await phone.close();

    const scale = tokens.desktop.scale;
    for (const key of ['map', 'pause'] as const) {
      expect(p[key].width).toBeGreaterThan(0);
      expect(p[key].height).toBeGreaterThan(0);
      expect(Math.abs(d[key].width - p[key].width * scale)).toBeLessThanOrEqual(1);
      expect(Math.abs(d[key].height - p[key].height * scale)).toBeLessThanOrEqual(1);
    }
  }, 60_000);
});
