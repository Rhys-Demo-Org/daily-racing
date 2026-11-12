// The keycap legend leaves with motion (UI_RULES §7): in its slide-out state (`is-out`, set by the
// race UI once lap 1 is done; keycap-legend-slide-state.test.ts) the panel slides down off the
// bottom-left edge over the slide duration with snap easing, moving transform only, and the layer
// ends hidden. With reduced motion it cuts. Rendered in Chromium from a harness build.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { tokens } from '@tokens';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const DESKTOP = { width: 1440, height: 900, touch: false };

interface Leaving {
  transitions: { property: string; duration: number; easing: string }[];
  /** The layer's visibility as it starts leaving. */
  visibility: string;
  /** Panel top before leaving, and once its transitions finish. */
  topBefore: number;
  topAfter: number;
  visibilityAfter: string;
}

/** Puts the legend in its slide-out state, reports the transitions that start, then finishes every animation. */
function leave(page: Page): Promise<Leaving> {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="group"][aria-label="Keyboard controls"]');
    const layer = panel?.parentElement;
    if (!panel || !layer) throw new Error('no legend');
    const topBefore = panel.getBoundingClientRect().top;
    layer.classList.add('is-out');
    layer.setAttribute('aria-hidden', 'true');
    const running = document.getAnimations().filter((a): a is CSSTransition => a instanceof CSSTransition);
    const transitions = running.map((a) => {
      const t = a.effect?.getTiming();
      return { property: a.transitionProperty, duration: Number(t?.duration ?? 0), easing: String(t?.easing ?? '') };
    });
    const visibility = getComputedStyle(layer).visibility;
    for (const a of document.getAnimations()) a.finish();
    return { transitions, visibility, topBefore, topAfter: panel.getBoundingClientRect().top, visibilityAfter: getComputedStyle(panel).visibility };
  });
}

describe('keycap legend slide-out', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'keycap-slide-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC: the legend slides down off the bottom-left edge on transform over the slide duration with snap easing, then is hidden', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, DESKTOP);
    const out = await leave(await renderStage(ctx, origin, 'hud--first-lap'));
    await ctx.close();
    const snap = tokens.motion.easing.snap.replace(/\s/g, '').replace(/([(,])\./g, '$10.');
    const transform = out.transitions.find((t) => t.property === 'transform');
    expect(transform?.duration).toBe(tokens.motion.durationMs.slide);
    expect(transform?.easing.replace(/\s/g, '')).toBe(snap);
    expect(out.transitions.map((t) => t.property)).not.toContain('opacity');
    // Visible while it slides, hidden at the end, and moved down past the bottom edge.
    expect(out.visibility).toBe('visible');
    expect(out.visibilityAfter).toBe('hidden');
    expect(out.topAfter).toBeGreaterThanOrEqual(DESKTOP.height);
  }, 60_000);

  it('AC: with reduced motion the legend cuts out with no transition', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, DESKTOP);
    const page = await renderStage(ctx, origin, 'hud--first-lap');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const out = await leave(page);
    await ctx.close();
    expect(out.transitions).toEqual([]);
    expect(out.visibility).toBe('hidden');
  }, 60_000);
});
