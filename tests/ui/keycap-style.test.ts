// R3-2: keycaps in the "Keyboard controls" legend keep the cream panel look (ink outline at the
// default HUD width, rect radius, HUD shadow, cream fill with ink glyph) and GAS stays rally-red.
// Compared against the tokens' own CSS variables, rendered in Chromium from a harness build.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

interface Look {
  border: string;
  radius: string;
  shadow: string;
  background: string;
  color: string;
}

describe('keycap style', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'keycap-style-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('keycaps are cream panels with an ink outline and HUD shadow; the primary key is rally-red', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, 'hud--first-lap');
    const result = await page.evaluate(() => {
      const look = (el: Element): Look => {
        const s = getComputedStyle(el);
        return {
          border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
          radius: s.borderTopLeftRadius,
          shadow: s.boxShadow,
          background: s.backgroundColor,
          color: s.color,
        };
      };
      // Resolve the token variables the same way the browser does, on a probe element.
      const probe = document.createElement('div');
      probe.style.border = 'var(--outline-default) solid var(--color-ink)';
      probe.style.borderRadius = 'var(--radius-rect)';
      probe.style.boxShadow = 'var(--shadow-hud)';
      probe.style.background = 'var(--color-cream)';
      probe.style.color = 'var(--color-ink)';
      document.body.append(probe);
      const expected = look(probe);
      probe.style.background = 'var(--color-rally-red)';
      probe.style.color = 'var(--color-cream)';
      const primary = look(probe);
      probe.remove();

      const group = document.querySelector('[role="group"][aria-label="Keyboard controls"]');
      if (!group) throw new Error('no legend');
      const keys = [...group.children].flatMap((item) => [...item.children].filter((c) => !c.classList.contains('ui-label')));
      return { expected, primary, keys: keys.map(look) };
    });
    await ctx.close();

    expect(result.keys).toHaveLength(5);
    // Order: ← → (STEER), ↑ (GAS, primary), ↓ (BRAKE), ESC (PAUSE).
    const [left, right, gas, down, esc] = result.keys;
    for (const k of [left, right, down, esc]) expect(k).toEqual(result.expected);
    expect(gas).toEqual(result.primary);
  }, 60_000);
});
