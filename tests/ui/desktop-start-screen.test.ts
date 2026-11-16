// R4-2: the S6 menu uses the desktop layout (UI_RULES §5: same layout at ×1.45, 32px margins, 4px
// outlines, desktop type sizes) at 1440×900 without touch, and keeps its phone sizes on a phone.
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

interface MenuSnapshot {
  heading: string;
  label: string;
  race: string;
  raceOutline: string;
  cardName: string;
  cardOutline: string;
  cardWidth: number;
  headingLeft: number;
  raceRightGap: number;
}

function snapshot(page: Page): Promise<MenuSnapshot> {
  return page.evaluate(() => {
    const q = (sel: string): Element => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    const style = (sel: string): CSSStyleDeclaration => getComputedStyle(q(sel));
    const raceButton = [...document.querySelectorAll('button')].find((b) => /race/i.test(b.textContent ?? ''));
    if (!raceButton) throw new Error('missing RACE');
    const card = q('[role="radio"]');
    const name = document.getElementById(card.getAttribute('aria-labelledby') ?? '');
    if (!name) throw new Error('missing card name');
    return {
      heading: style('h1').fontSize,
      label: style('h2').fontSize,
      race: getComputedStyle(raceButton).fontSize,
      raceOutline: getComputedStyle(raceButton).borderTopWidth,
      cardName: getComputedStyle(name).fontSize,
      cardOutline: getComputedStyle(card).borderTopWidth,
      cardWidth: card.getBoundingClientRect().width,
      headingLeft: q('h1').getBoundingClientRect().left,
      raceRightGap: window.innerWidth - raceButton.getBoundingClientRect().right,
    };
  });
}

describe('desktop start screen', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'desktop-start-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('at 1440×900 without touch the menu uses desktop type, 4px outlines, scaled cards and 32px margins; the phone keeps its sizes', async () => {
    if (!browser) throw new Error('no browser');
    const phone = await context(browser, PHONE);
    const p = await snapshot(await renderStage(phone, origin, 'start--menu'));
    await phone.close();
    expect(p.heading).toBe('56px');
    expect(p.label).toBe('32px');
    expect(p.race).toBe('32px');
    expect(p.cardName).toBe('22px');
    expect(p.raceOutline).toBe('3px');

    const desk = await context(browser, DESKTOP);
    const d = await snapshot(await renderStage(desk, origin, 'start--menu'));
    await desk.close();
    expect(d.heading).toBe('96px');
    expect(d.label).toBe('48px');
    expect(d.race).toBe('48px');
    expect(d.cardName).toBe('28px');
    expect(d.raceOutline).toBe('4px');
    expect(d.cardOutline).toBe('4px');
    expect(d.cardWidth).toBeGreaterThan(p.cardWidth * 1.4);
    expect(d.headingLeft).toBe(32);
    expect(d.raceRightGap).toBe(32);
  }, 60_000);
});
