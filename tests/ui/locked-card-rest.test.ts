// B14 · A locked card never lifts or sinks (UI_RULES §12): in the eight-card stage at 1440×900 the
// locked radio keeps its at-rest transform and shadow under hover and while the mouse is held on it;
// releasing the mouse shakes it, at rest height and shadow, back to identity. An unlocked card still
// lifts on hover.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, launch, renderStage, serve } from '../../harness/screens/browser.ts';
import { finishShake, sampleShake, settledPose, shakeState } from './locked-card.ts';

const STAGE = 'track-select--many-cards';

async function hover(page: Page, card: Locator): Promise<void> {
  const box = await card.boundingBox();
  if (!box) throw new Error('no card box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

describe('B14 locked card at rest', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'locked-card-rest-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('AC7: the locked card neither lifts on hover nor sinks when held; release shakes it to identity; an unlocked card lifts', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, { width: 1440, height: 900, touch: false });
    const page = await renderStage(ctx, origin, STAGE);
    const locked = page.locator('[role="radio"][aria-disabled="true"]');
    expect(await locked.count()).toBe(1);
    const rest = await settledPose(page, locked);
    expect(rest.identity).toBe(true);

    await hover(page, locked);
    expect(await settledPose(page, locked)).toEqual(rest);
    await page.mouse.down();
    expect(await settledPose(page, locked)).toEqual(rest);
    await page.mouse.up();

    const shake = await shakeState(locked);
    expect(shake.count).toBe(1);
    expect(shake.duration).toBe(250);
    // Mid-shake it stays at rest height with its rest shadow.
    const samples = await sampleShake(locked, [60, 120, 180]);
    expect(samples.some(([x]) => x !== 0)).toBe(true);
    for (const [, y] of samples) expect(y).toBe(0);
    expect(await locked.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(rest.shadow);
    expect(await finishShake(locked)).toEqual({ left: 0, identity: true });

    const open = page.getByRole('radio', { name: /Dust Bowl/ });
    await hover(page, open);
    const lifted = await settledPose(page, open);
    expect(lifted.dx).toBeLessThan(0);
    expect(lifted.dy).toBeLessThan(0);
    assertNoErrors(page, STAGE);
    await ctx.close();
  }, 60_000);
});
