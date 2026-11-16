// Shared plumbing for the B09 HUD motion tests: a harness build served to Chromium, the hud-motion
// stages rendered at 844×390 (with or without reduced motion), and a probe that reads the computed
// animation of HUD elements found by their visible label or accessible name.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll } from 'vitest';
import { context, launch, open, serve, STAGES_PAGE, STAGES_READY } from '../../harness/screens/browser.ts';

export const PHONE = { width: 844, height: 390, touch: true };

/** What a probe target names: a panel by its label text, or an element by its accessible name. */
export type Target = { label: string } | { name: string } | { digitIn: string; text: string };

export interface Motion {
  /** The first animated element from the target up to the stage root, or null if none is. */
  name: string | null;
  duration: string;
  timing: string;
  delay: string;
}

/** The race-entry elements in order: the HUD panels, then the touch controls. */
export const ENTERING: Target[] = [
  { label: 'Pos' },
  { label: 'Lap' },
  { name: 'Track map' },
  { label: 'Time' },
  { name: 'Pause' },
  { name: 'Steer left' },
  { name: 'Steer right' },
  { name: 'Brake or reverse' },
  { name: 'Accelerate' },
];

export const AT_REST: Motion = { name: null, duration: '', timing: '', delay: '' };

/** Builds the harness pages once per file and launches Chromium. */
export function setup(): { browser(): Browser; origin(): string } {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';
  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'hud-motion-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });
  return {
    browser: () => {
      if (!browser) throw new Error('no browser');
      return browser;
    },
    origin: () => origin,
  };
}

/** Renders hud-motion stage `stage` at 844×390 on a fresh page, with reduced motion if asked. */
export async function stage(browser: Browser, origin: string, name: string, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<Page> {
  const ctx = await context(browser, PHONE);
  const page = await open(ctx, origin, STAGES_PAGE, STAGES_READY);
  await page.emulateMedia({ reducedMotion });
  await page.evaluate((n) => {
    const w = window as unknown as { __stages: { render(n: string): void } };
    w.__stages.render(n);
  }, `hud-motion--${name}`);
  return page;
}

/** The computed animation on each target (or the nearest animated wrapper above it). */
export function probe(page: Page, targets: Target[]): Promise<Motion[]> {
  return page.evaluate((ts) => {
    const all = [...document.querySelectorAll<HTMLElement>('body *')];
    const ownText = (el: Element): string =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
    const find = (t: (typeof ts)[number]): Element => {
      let el: Element | null | undefined;
      if ('label' in t) el = all.find((e) => ownText(e).toLowerCase() === t.label.toLowerCase())?.parentElement;
      else if ('name' in t) el = all.find((e) => e.getAttribute('aria-label') === t.name);
      else {
        const panel = all.find((e) => ownText(e).toLowerCase() === t.digitIn.toLowerCase())?.parentElement;
        el = [...(panel?.querySelectorAll('*') ?? [])].find((e) => e.children.length === 0 && e.textContent === t.text);
      }
      if (!el) throw new Error(`not found: ${JSON.stringify(t)}`);
      return el;
    };
    return ts.map((t) => {
      for (let e: Element | null = find(t); e && e.id !== 'app'; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.animationName !== 'none') return { name: cs.animationName, duration: cs.animationDuration, timing: cs.animationTimingFunction, delay: cs.animationDelay };
      }
      return { name: null, duration: '', timing: '', delay: '' };
    });
  }, targets);
}

/** The visible text of the panel labelled `label` (e.g. "2/3" for LAP), without the label. */
export function panelValue(page: Page, label: string): Promise<string> {
  return page.evaluate((l) => {
    const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent?.trim().toLowerCase() === l.toLowerCase());
    const panel = el?.parentElement;
    if (!panel || !el) throw new Error(`no ${l} panel`);
    return (panel.textContent ?? '').replace(el.textContent ?? '', '').trim();
  }, label);
}

export const STAMP = 'cubic-bezier(0.3, 1.5, 0.5, 1)';
export const SNAP = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
