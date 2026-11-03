// The results screen fits the 844×390 phone frame with the six rows every player race now has
// (B04): the stripes, the track title, every row and RETRY / NEXT RACE are all on screen, because
// nothing on the menu ground can scroll. Rendered in Chromium from a harness build, like the
// screenshots (harness/screens).
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, launch, renderStage, serve } from '../../harness/screens/browser.ts';

const PHONE = { width: 844, height: 390, touch: true };

describe('results screen at 844×390 with six racers', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'results-fit-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('shows the title, all six rows and both buttons inside the viewport', async () => {
    if (!browser) throw new Error('no browser');
    const ctx = await context(browser, PHONE);
    const page = await renderStage(ctx, origin, 'results--podium');
    const boxes = await page.evaluate(() => {
      const screen = document.querySelector('.ui-results');
      if (!screen) throw new Error('no results screen');
      const parts = [
        ...screen.querySelectorAll('.ui-stripes, h2, [role="row"]'),
        ...[...screen.querySelectorAll('button')].filter((b) => /retry|next race/i.test(b.textContent ?? '')),
      ];
      return parts.map((el) => {
        const r = el.getBoundingClientRect();
        return { what: `${el.tagName} ${(el.textContent ?? '').trim().slice(0, 20)}`, top: r.top, left: r.left, bottom: r.bottom, right: r.right };
      });
    });
    await ctx.close();
    // Stripes + title, header + six rows, two buttons.
    expect(boxes.filter((b) => b.what.startsWith('BUTTON'))).toHaveLength(2);
    expect(boxes.filter((b) => b.what.startsWith('DIV') && /^\d/.test(b.what.slice(4)))).toHaveLength(6);
    const off = boxes.filter((b) => b.top < 0 || b.left < 0 || b.bottom > PHONE.height || b.right > PHONE.width);
    expect(off).toEqual([]);
  }, 60_000);
});
