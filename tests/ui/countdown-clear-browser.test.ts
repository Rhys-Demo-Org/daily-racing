// The owner's play-test bug: the follow camera centred the player's car and the countdown roundel
// (3, 2, 1, GO!) sits in the screen centre, so the car was hidden until GO! had gone. Here the real
// game runs in Chromium (harness build, window.__racer) at 844×390 and 1440×900; at each countdown
// beat and under GO! the real .ui-cd-roundel box is read from the page, and the player car's box is
// projected from the same race's car positions through the race camera (the car stands still on
// its grid slot with no input, so the camera sits exactly on its countdown framing), and the
// screenshot of that box must show the player's red body, so the game really framed it there.
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { PALETTE_HEX, paletteIndex, tokens } from '@tokens';
import { PNG } from 'pngjs';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, GAME_READY, launch, open, serve } from '../../harness/screens/browser.ts';
import { raceDrivers } from '../../src/content/drivers.ts';
import { TRACKS } from '../../src/content/tracks.ts';
import { createRaceScene } from '../../src/render/index.ts';
import { COUNTDOWN_TICKS, TICK_HZ, createWorld, type CarView } from '../../src/sim/index.ts';
import { overlaps, playerBox, ROUNDEL_WIDTH_PX, VIEWPORTS } from './countdown-clear.ts';

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

const CARS = 6;
/** World ticks to sample: each beat (3, 2, 1) and GO! just after it lands. */
const MOMENTS = [TICK_HZ / 6, TICK_HZ + TICK_HZ / 6, 2 * TICK_HZ + TICK_HZ / 6, COUNTDOWN_TICKS + 20];

describe('the countdown never covers the player car (browser, 844×390 and 1440×900)', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'countdown-clear-'));
    await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    ({ origin, server } = await serve(dist));
    browser = await launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  for (const v of VIEWPORTS) {
    for (const track of TRACKS) {
      it(`${track.id} at ${v.width}×${v.height}: the player car is clear of every roundel`, async () => {
        if (!browser) throw new Error('no browser');
        const ctx = await context(browser, { ...v, touch: v.width < 1000 });
        const page = await open(ctx, origin, '/', GAME_READY);
        await page.evaluate(
          ({ id, cars }) => {
            const r = (window as unknown as { __racer: { startRace(o: object): unknown; freeze(): void } }).__racer;
            r.startRace({ track: id, seed: 1, carCount: cars });
            r.freeze();
          },
          { id: track.id, cars: CARS },
        );
        const world = createWorld(track, { seed: 1, carCount: CARS });
        const red = hexRgb(PALETTE_HEX[paletteIndex(tokens.cars.player.body)] ?? '');
        const texts: string[] = [];
        let at = 0;
        for (const tick of MOMENTS) {
          const s = await page.evaluate((n) => {
            const w = window as unknown as { __racer: { step(n: number): { cars: CarView[] } }; __settle(): void };
            const state = w.__racer.step(n);
            w.__settle();
            const el = document.querySelector('.ui-cd-roundel');
            if (!el) throw new Error('no countdown roundel');
            const r = el.getBoundingClientRect();
            return { cars: state.cars, roundel: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, text: (el.textContent ?? '').trim() };
          }, tick - at);
          at = tick;
          texts.push(s.text);
          // The unit test's roundel widths are no narrower than the real ones.
          expect(s.roundel.right - s.roundel.left).toBeLessThanOrEqual(s.text === 'Go!' ? ROUNDEL_WIDTH_PX.go : ROUNDEL_WIDTH_PX.number);
          // The game's framing, rebuilt: a fresh scene snapped to the standing car, countdown on.
          const race = createRaceScene(world.track.layout, raceDrivers(CARS));
          race.resize(v.width, v.height);
          race.update(s.cars, 0, true);
          const car = playerBox(race, v.width, v.height);
          expect(overlaps(car, s.roundel), `${s.text}: car ${JSON.stringify(car)} vs roundel ${JSON.stringify(s.roundel)}`).toBe(false);
          expect(car.left).toBeGreaterThan(0);
          expect(car.top).toBeGreaterThan(0);
          expect(car.bottom).toBeLessThan(v.height);
          // And the real game drew the red car there: its body colour fills part of that box.
          const clip = { x: Math.floor(car.left), y: Math.floor(car.top), width: Math.ceil(car.right - car.left), height: Math.ceil(car.bottom - car.top) };
          const png = PNG.sync.read(await page.screenshot({ clip }));
          let hits = 0;
          for (let i = 0; i < png.data.length; i += 4) {
            if (Math.abs((png.data[i] ?? 0) - red[0]) + Math.abs((png.data[i + 1] ?? 0) - red[1]) + Math.abs((png.data[i + 2] ?? 0) - red[2]) < 24) hits++;
          }
          expect(hits, `${s.text}: red pixels in the car box`).toBeGreaterThan(100);
        }
        assertNoErrors(page, track.id);
        await ctx.close();
        expect(texts).toEqual(['3', '2', '1', 'Go!']);
      }, 60_000);
    }
  }
});
