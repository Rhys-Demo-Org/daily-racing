// B14 · The locked-card shake (UI_RULES §12): clicking or tapping the locked Pine Ridge card, or
// pressing Enter or Space on it, plays one 250ms snap-eased shake (translateX 0, 4, −4, 4, 0px) that
// ends at rest, restarts rather than stacks, leaves the selection, focus and scroll alone, and is
// cut under reduced motion. Runs the real 'start--menu' stage in Chromium.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, launch, renderStage, serve } from '../../harness/screens/browser.ts';
import { bezier, checkedName, finishShake, sampleShake, shakeState } from './locked-card.ts';

const STAGE = 'start--menu';
const pine = (page: Page): Locator => page.getByRole('radio', { name: /Pine Ridge/ });

/** Asserts the card is running exactly the §12 shake, samples it, then finishes it at rest. */
async function expectOneShake(card: Locator): Promise<void> {
  const state = await shakeState(card);
  expect(state.count).toBe(1);
  expect(state.duration).toBe(250);
  expect(bezier(state.easing)).toEqual([0.2, 0.9, 0.3, 1]);
  expect(state.fill === 'none' || state.fill === 'auto').toBe(true);
  expect(state.frames).toEqual([
    [0, 0],
    [4, 0],
    [-4, 0],
    [4, 0],
    [0, 0],
  ]);
  // Snap easing front-loads the swings (the left one lands near 35ms), so sample every 5ms.
  const samples = await sampleShake(card, Array.from({ length: 49 }, (_, i) => (i + 1) * 5));
  expect(samples.some(([x]) => x > 0.5)).toBe(true);
  expect(samples.some(([x]) => x < -0.5)).toBe(true);
  for (const [x, y] of samples) {
    expect(Math.abs(x)).toBeLessThanOrEqual(4.001);
    expect(y).toBe(0);
  }
  expect(await finishShake(card)).toEqual({ left: 0, identity: true });
}

describe('B14 locked-card shake', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'locked-card-shake-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC3: clicking (1440×900) or tapping (844×390) the locked card plays one 250ms snap shake and leaves the selection', async () => {
    if (!browser) throw new Error('no browser');
    for (const touch of [false, true]) {
      const ctx = await context(browser, touch ? { width: 844, height: 390, touch } : { width: 1440, height: 900, touch });
      const page = await renderStage(ctx, origin, STAGE);
      const checked = await checkedName(page);
      const card = pine(page);
      expect(await card.getAttribute('aria-disabled')).toBe('true');
      expect(await card.evaluate((el) => el.getAnimations().length)).toBe(0);
      if (touch) await card.tap({ force: true });
      else await card.click({ force: true });
      await expectOneShake(card);
      expect(await card.getAttribute('aria-checked')).toBe('false');
      expect(await checkedName(page)).toBe(checked);
      assertNoErrors(page, STAGE);
      await ctx.close();
    }
  }, 60_000);

  it('AC4: Enter and Space on the focused locked card each shake it; selection, focus and scroll stay put', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 844, height: 390, touch: true });
    const page = await renderStage(ctx, origin, STAGE);
    const checked = await checkedName(page);
    const card = pine(page);
    await card.focus();
    const scroll = (): Promise<[number, number]> => page.evaluate(() => [window.scrollY, document.querySelector('[role="radiogroup"]')?.scrollLeft ?? -1]);
    const before = await scroll();
    for (const key of ['Enter', ' ']) {
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      await expectOneShake(card);
      expect(await card.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await checkedName(page)).toBe(checked);
      expect(await scroll()).toEqual(before);
    }
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);

  it('AC5: three quick activations by click or Enter never stack shakes, and the last ends at rest', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, STAGE);
    const card = pine(page);
    // aria-disabled: Playwright clicks it only when forced.
    // Three clicks in one task (well inside 100ms).
    const counts = await card.evaluate((el) => {
      const seen: number[] = [];
      for (let i = 0; i < 3; i++) {
        (el as HTMLElement).click();
        seen.push(el.getAnimations().length);
      }
      return seen;
    });
    expect(counts).toEqual([1, 1, 1]);
    expect(await finishShake(card)).toEqual({ left: 0, identity: true });
    // Three Enters while focused.
    await card.focus();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter');
      expect(await card.evaluate((el) => el.getAnimations().length)).toBe(1);
    }
    expect(await finishShake(card)).toEqual({ left: 0, identity: true });
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);

  it('AC6: under prefers-reduced-motion: reduce, click, Enter and Space start no shake and change nothing', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, STAGE);
    const checked = await checkedName(page);
    const card = pine(page);
    // With motion allowed the same click shakes the card...
    await card.click({ force: true });
    expect(await card.evaluate((el) => el.getAnimations().length)).toBe(1);
    expect(await finishShake(card)).toEqual({ left: 0, identity: true });
    // ...and with reduced motion nothing moves.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const still = async (): Promise<void> => {
      expect(await card.evaluate((el) => el.getAnimations().length)).toBe(0);
      expect(await card.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
      expect(await checkedName(page)).toBe(checked);
    };
    await card.click({ force: true });
    await still();
    await card.focus();
    await page.keyboard.press('Enter');
    await still();
    await page.keyboard.press('Space');
    await still();
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);
});
