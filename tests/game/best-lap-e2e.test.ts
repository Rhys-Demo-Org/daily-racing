// End-to-end check of B07 (best-lap persistence and the NEW BEST chip) on the real built game in
// Chromium, at 844×390 (touch) and 1440×900 (desktop, B05's desktop HUD and keycap legend). The
// race runs through window.__racer with real time frozen; the player's inputs come from a bot
// driving car 0 of a twin world in Node (same track, seed and car count), so the browser race and
// the twin are tick-identical and every lap time is known in advance. Storage is the page's real
// localStorage, kept across page loads within one browser context.
//
// Screenshots go to test-results/best-lap-e2e/ when that directory exists (it is gitignored).
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { tokens } from '@tokens';
import { PNG } from 'pngjs';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoErrors, context, GAME_READY, launch, open, serve } from '../../harness/screens/browser.ts';
import { PLAYER_CAR_COUNT } from '../../src/content/drivers.ts';
import { getTrack } from '../../src/content/tracks.ts';
import { COUNTDOWN_TICKS, TICK_HZ, createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';
import { formatTime, NO_TIME, ticksToMs } from '../../src/ui/format.ts';
import { botsFor, NO_INPUT } from '../sim/helpers.ts';

const PHONE = { width: 844, height: 390, touch: true };
const DESKTOP = { width: 1440, height: 900, touch: false };
const SEED = 5;
const SHOTS = 'test-results/best-lap-e2e';

const toTicks = (ms: number): number => Math.ceil((ms * TICK_HZ) / 1000);
const SLIDE = tokens.motion.durationMs.slide;
/** Ticks after the lap that the chip is still fully out, and by which it is gone (spec AC4). */
const LAST_OUT = toTicks(SLIDE + 2000) - 1;
const GONE = toTicks(2 * SLIDE + 2000);

/** A whole race for the player: inputs per world tick, and the player's lap times in ticks. */
interface Plan {
  inputs: CarInput[];
  lapTicks: number[];
}

/**
 * The bot's inputs for car 0 from a twin world, stepped until car 0 finishes. `idle` ticks per lap
 * (from 200 ticks into each lap) send no input instead, so every lap is slower.
 */
function plan(trackId: string, idle = 0): Plan {
  const world = createWorld(getTrack(trackId), {
    seed: SEED,
    carCount: PLAYER_CAR_COUNT,
  });
  const bots = botsFor(world);
  const inputs: CarInput[] = [];
  let lapStart = COUNTDOWN_TICKS;
  let laps = 0;
  for (let i = 0; i < 60 * 60 * 10 && world.racers[0]?.finishTick == null; i++) {
    const tickInputs = bots.map((b) => b.input(world));
    const into = world.tick - lapStart;
    if (into >= 200 && into < 200 + idle) tickInputs[0] = NO_INPUT;
    inputs.push(tickInputs[0] as CarInput);
    stepWorld(world, tickInputs);
    const done = world.racers[0]?.lapTicks.length ?? 0;
    if (done !== laps) {
      laps = done;
      lapStart = world.tick;
    }
  }
  const lapTicks = [...(world.racers[0]?.lapTicks ?? [])];
  expect(world.racers[0]?.finishTick).not.toBeNull();
  return { inputs, lapTicks };
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Snap {
  tick: number;
  raceTick: number;
  laps: number;
  phase: string;
  best: string;
  /** NEW BEST chip: rendered (visibility), class phase, computed transform, box, transitions running. */
  newBest: {
    visible: boolean;
    ariaHidden: string | null;
    out: boolean;
    back: boolean;
    transform: string;
    box: Box;
    transitions: string[];
  };
  bestBox: Box;
  timeBox: Box;
  desktopHud: boolean;
  legend: { visible: boolean; box: Box | null };
  results: { visible: boolean; label: string; value: string };
  /** Boxes of the other visible HUD/overlay widgets, to check nothing sits on the chip. */
  others: { name: string; box: Box }[];
  stored: Record<string, string | null>;
}

/** Plays `inputs` (one per tick) through the driver, then reads the UI, before settling animations. */
async function play(page: Page, inputs: readonly CarInput[]): Promise<Snap> {
  return page.evaluate((ins) => {
    const w = window as unknown as {
      __racer: {
        play(i: readonly CarInput[]): {
          race: {
            raceTick: number;
            phase: string;
            racers: { lapTicks: number[] }[];
          } | null;
        };
      };
      __settle(): void;
    };
    const st = ins.length ? w.__racer.play(ins) : (w.__racer as unknown as { state(): ReturnType<typeof w.__racer.play> }).state();
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const q = (sel: string): HTMLElement => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    };
    const chip = q('.ui-hud-new-best');
    const transitions = chip.getAnimations().map((a) => `${(a as CSSTransition).transitionProperty}:${String(a.effect?.getTiming().duration)}`);
    const legendEl = document.querySelector('.ui-keys');
    const resultsBest = document.querySelector<HTMLElement>('.ui-results__best');
    const others = [...document.querySelectorAll('.ui-panel, .ui-tc, .ui-cd-roundel, .ui-hud-pause, .ui-hud-map, .ui-keys .ui-panel, .ui-keys > *')]
      .filter((el) => !el.closest('.ui-hud__timer') && shown(el))
      .map((el) => ({ name: el.className.toString(), box: box(el) }));
    const stored: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('racer.bestLap.')) stored[k] = localStorage.getItem(k);
    }
    const snap = {
      tick: 0,
      raceTick: st.race?.raceTick ?? -1,
      laps: st.race?.racers[0]?.lapTicks.length ?? -1,
      phase: st.race?.phase ?? '',
      best: (q('.ui-hud-best__value').textContent ?? '').trim(),
      newBest: {
        visible: shown(chip),
        ariaHidden: chip.getAttribute('aria-hidden'),
        out: chip.classList.contains('is-out'),
        back: chip.classList.contains('is-back'),
        transform: getComputedStyle(chip).transform,
        box: box(chip),
        transitions,
      },
      bestBox: box(q('.ui-hud-best')),
      timeBox: box(q('.ui-hud-time')),
      desktopHud: q('.ui-hud').classList.contains('is-desktop'),
      legend: {
        visible: legendEl !== null && shown(legendEl),
        box: legendEl && shown(legendEl) ? box(legendEl.firstElementChild ?? legendEl) : null,
      },
      results: {
        visible: resultsBest !== null && shown(resultsBest),
        label: (resultsBest?.querySelector('.ui-label')?.textContent ?? '').trim(),
        value: (resultsBest?.querySelector('.ui-value')?.textContent ?? '').trim(),
      },
      others,
      stored,
    };
    w.__settle();
    return snap;
  }, inputs);
}

const overlap = (a: Box, b: Box): boolean => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** Fraction of the chip's pixels in its own background colour (covered or clipped chips score low). */
async function chipFill(page: Page, box: Box): Promise<number> {
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.ui-hud-new-best') as Element).backgroundColor);
  const rgb = (bg.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const clip = {
    x: Math.ceil(box.left),
    y: Math.ceil(box.top),
    width: Math.floor(box.right - box.left) - 1,
    height: Math.floor(box.bottom - box.top) - 1,
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs((png.data[i] ?? 0) - (rgb[0] ?? 0)) + Math.abs((png.data[i + 1] ?? 0) - (rgb[1] ?? 0)) + Math.abs((png.data[i + 2] ?? 0) - (rgb[2] ?? 0)) < 12) hits++;
  }
  return hits / (png.data.length / 4);
}

async function shot(page: Page, name: string): Promise<void> {
  if (existsSync(SHOTS)) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function startRace(page: Page, track: string): Promise<Snap> {
  await page.evaluate(
    ({ track, seed, cars }) => {
      const r = (
        window as unknown as {
          __racer: { startRace(o: object): unknown; freeze(): void };
        }
      ).__racer;
      r.startRace({ track, seed, carCount: cars });
      r.freeze();
    },
    { track, seed: SEED, cars: PLAYER_CAR_COUNT },
  );
  return play(page, []);
}

/** A race's outcome as the UI saw it at each lap end, and at the finish. */
interface RaceRun {
  /** Per lap: whether the NEW BEST chip was out on the frame the lap ended, and the BEST chip then. */
  lapEnds: { newBest: boolean; best: string }[];
  /** Any frame (sampled every 60 ticks, < the chip's lifetime) with the chip visible. */
  everVisible: boolean;
  timeBoxes: Box[];
  finish: Snap;
}

interface DriveHooks {
  /** Called on the frame a lap ended (world tick `at`); may play on and return the new cursor. */
  onLapEnd?: (lap: number, at: number, snap: Snap) => Promise<number | undefined>;
  onSnap?: (snap: Snap) => void;
}

/** Drives a whole race plan: to each lap end exactly, then on in 60-tick chunks; stops at the finish. */
async function driveRace(page: Page, p: Plan, hooks: DriveHooks = {}): Promise<RaceRun> {
  const ends: number[] = [];
  let sum = COUNTDOWN_TICKS;
  for (const t of p.lapTicks) ends.push((sum += t));
  const run: RaceRun = {
    lapEnds: [],
    everVisible: false,
    timeBoxes: [],
    finish: undefined as unknown as Snap,
  };
  let at = 0;
  let lap = 0;
  let snap: Snap | undefined;
  while (at < p.inputs.length) {
    const next = Math.min(at + 60, ends[lap] ?? Infinity, p.inputs.length);
    snap = await play(page, p.inputs.slice(at, next));
    at = next;
    hooks.onSnap?.(snap);
    run.everVisible ||= snap.newBest.visible;
    if (snap.phase === 'racing') run.timeBoxes.push(snap.timeBox);
    if (at === ends[lap]) {
      expect(snap.laps, `lap ${lap + 1} ends at world tick ${at}`).toBe(lap + 1);
      run.lapEnds.push({
        newBest: snap.newBest.out && snap.newBest.visible,
        best: snap.best,
      });
      if (hooks.onLapEnd) at = (await hooks.onLapEnd(lap, at, snap)) ?? at;
      lap++;
    }
  }
  if (!snap) throw new Error('empty plan');
  run.finish = snap;
  return run;
}

describe('B07 best laps and NEW BEST, end to end in the built game (844×390 and 1440×900)', () => {
  let dist = '';
  let server: Server | undefined;
  let browser: Browser | undefined;
  let origin = '';
  let fast: Record<string, Plan> = {};
  let slow: Plan | undefined;

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'best-lap-e2e-'));
    await build({
      configFile: 'harness/screens/vite.config.ts',
      logLevel: 'silent',
      build: { outDir: dist, emptyOutDir: true },
    });
    ({ origin, server } = await serve(dist));
    browser = await launch();
    fast = { 'dust-bowl': plan('dust-bowl'), 'hay-loop': plan('hay-loop') };
    slow = plan('dust-bowl', 240);
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  for (const v of [PHONE, DESKTOP]) {
    const tag = v.touch ? 'phone' : 'desktop';
    describe(`${v.width}×${v.height} (${tag})`, () => {
      let ctx: BrowserContext | undefined;
      let page: Page | undefined;
      /** The best dust-bowl lap of the fast plan, in ms. */
      let botBest = 0;

      const reload = async (): Promise<Page> => {
        if (!ctx) throw new Error('no context');
        if (page) {
          assertNoErrors(page, tag);
          await page.close();
        }
        page = await open(ctx, origin, '/', GAME_READY);
        return page;
      };

      afterAll(async () => {
        if (page) assertNoErrors(page, tag);
        await ctx?.close();
      });

      it('fresh storage: BEST shows dashes, lap 1 sets a best and slides NEW BEST out, holds, slides back; TIME never moves; the results chip reads NEW BEST LAP', async () => {
        if (!browser) throw new Error('no browser');
        ctx = await context(browser, v);
        const pg = await reload();
        const p = fast['dust-bowl'] as Plan;
        const lapMs = p.lapTicks.map(ticksToMs);
        botBest = Math.min(...lapMs);

        const start = await startRace(pg, 'dust-bowl');
        expect(start.stored).toEqual({});
        expect(start.best).toBe(NO_TIME);
        expect(start.newBest.visible).toBe(false);
        expect(start.desktopHud).toBe(!v.touch);

        let legendBox: Box | null = null;
        const run = await driveRace(pg, p, {
          onSnap: (snap) => {
            if (snap.laps === 0 && snap.legend.visible) legendBox = snap.legend.box;
          },
          onLapEnd: async (lap, at, out) => {
            if (lap !== 0) return undefined;
            // The frame lap 1 ended on: NEW BEST is out, sliding by transform, BEST shows the lap.
            expect(out.best).toBe(formatTime(lapMs[0] as number));
            expect(out.newBest.out).toBe(true);
            expect(out.newBest.visible).toBe(true);
            expect(out.newBest.ariaHidden).toBe('false');
            expect(out.newBest.transitions).toContain(`transform:${SLIDE}`);
            // Settled: fully out, tucked directly under BEST, same width column, inside the viewport.
            const settled = await play(pg, []);
            expect(settled.newBest.transform).toBe('none');
            expect(Math.abs(settled.newBest.box.top - settled.bestBox.bottom)).toBeLessThanOrEqual(1);
            expect(settled.newBest.box.left).toBeGreaterThanOrEqual(settled.bestBox.left - 1);
            expect(settled.newBest.box.right).toBeLessThanOrEqual(settled.bestBox.right + 1);
            expect(settled.newBest.box.bottom).toBeLessThanOrEqual(v.height);
            expect(settled.newBest.box.bottom - settled.newBest.box.top).toBeGreaterThan(8);
            // Nothing else sits on it, and it really paints: mostly its own mustard.
            for (const o of settled.others) expect(overlap(o.box, settled.newBest.box), `${o.name} covers NEW BEST`).toBe(false);
            if (legendBox) {
              expect(overlap(legendBox, settled.newBest.box), 'legend vs NEW BEST').toBe(false);
              expect(overlap(legendBox, settled.bestBox), 'legend vs BEST').toBe(false);
              expect(overlap(legendBox, settled.timeBox), 'legend vs TIME').toBe(false);
            }
            expect(await chipFill(pg, settled.newBest.box)).toBeGreaterThan(0.5);
            await shot(pg, `${tag}-new-best`);
            // Holds until slide + 2 s, then slides back (still visible, transform up), then gone.
            const raceEnd = at - COUNTDOWN_TICKS;
            const hold = await play(pg, p.inputs.slice(at, COUNTDOWN_TICKS + raceEnd + LAST_OUT));
            expect(hold.raceTick).toBe(raceEnd + LAST_OUT);
            expect([hold.newBest.out, hold.newBest.visible, hold.newBest.transform]).toEqual([true, true, 'none']);
            const back = await play(pg, p.inputs.slice(COUNTDOWN_TICKS + raceEnd + LAST_OUT, COUNTDOWN_TICKS + raceEnd + LAST_OUT + 1));
            expect([back.newBest.out, back.newBest.back, back.newBest.visible]).toEqual([false, true, true]);
            expect(back.newBest.transitions).toContain(`transform:${SLIDE}`);
            const backSettled = await play(pg, []);
            expect(backSettled.newBest.transform).not.toBe('none');
            expect(backSettled.newBest.box.bottom).toBeLessThanOrEqual(backSettled.bestBox.bottom + 1);
            const gone = await play(pg, p.inputs.slice(COUNTDOWN_TICKS + raceEnd + LAST_OUT + 1, COUNTDOWN_TICKS + raceEnd + GONE));
            expect(gone.raceTick).toBe(raceEnd + GONE);
            expect([gone.newBest.visible, gone.newBest.ariaHidden]).toEqual([false, 'true']);
            for (const s of [out, settled, hold, back, backSettled, gone]) expect(s.timeBox).toEqual(out.timeBox);
            // The race carries on from here.
            return COUNTDOWN_TICKS + raceEnd + GONE;
          },
        });

        // Desktop: the keycap legend showed during lap 1 (and only on desktop).
        expect(legendBox !== null).toBe(!v.touch);
        // Every lap end: NEW BEST iff the lap beat every earlier lap; BEST shows the running best.
        let best = Infinity;
        run.lapEnds.forEach((e, i) => {
          const ms = lapMs[i] as number;
          expect(e.newBest, `lap ${i + 1} (${ms} ms, best so far ${best})`).toBe(ms < best);
          best = Math.min(best, ms);
          expect(e.best).toBe(formatTime(best));
        });
        // TIME never moved for the whole race.
        for (const b of run.timeBoxes) expect(b).toEqual(run.timeBoxes[0]);
        // Storage holds the best lap in ms; the results chip reads NEW BEST LAP with this race's best.
        expect(run.finish.phase).toBe('finished');
        expect(run.finish.stored).toEqual({
          'racer.bestLap.dust-bowl': String(botBest),
        });
        expect(run.finish.results.visible).toBe(true);
        expect(run.finish.results.label.toLowerCase()).toBe('new best lap');
        expect(run.finish.results.value).toBe(formatTime(botBest));
        await shot(pg, `${tag}-results-new-best-lap`);
      }, 300_000);

      it('reload: the stored best shows in BEST before any lap; hay-loop has its own (empty) best', async () => {
        const pg = await reload();
        const s = await startRace(pg, 'dust-bowl');
        expect(s.stored).toEqual({
          'racer.bestLap.dust-bowl': String(botBest),
        });
        expect(s.best).toBe(formatTime(botBest));
        const later = await play(pg, (fast['dust-bowl'] as Plan).inputs.slice(0, COUNTDOWN_TICKS + 120));
        expect(later.laps).toBe(0);
        expect(later.best).toBe(formatTime(botBest));
        expect(later.newBest.visible).toBe(false);
        const hay = await startRace(pg, 'hay-loop');
        expect(hay.best).toBe(NO_TIME);
      }, 120_000);

      it('a slower race shows no NEW BEST, keeps the stored best, and the results chip reads BEST LAP', async () => {
        const pg = await reload();
        const p = slow as Plan;
        const slowMs = p.lapTicks.map(ticksToMs);
        expect(Math.min(...slowMs)).toBeGreaterThan(botBest);
        await startRace(pg, 'dust-bowl');
        const run = await driveRace(pg, p);
        expect(run.everVisible).toBe(false);
        expect(run.lapEnds.map((e) => e.best)).toEqual(slowMs.map(() => formatTime(botBest)));
        expect(run.finish.stored['racer.bestLap.dust-bowl']).toBe(String(botBest));
        expect(run.finish.results.label.toLowerCase()).toBe('best lap');
        expect(run.finish.results.value).toBe(formatTime(Math.min(...slowMs)));
        await shot(pg, `${tag}-results-best-lap`);
      }, 300_000);

      it('bests are per track: a hay-loop best is saved under its own key and leaves dust-bowl alone', async () => {
        const pg = await reload();
        const p = fast['hay-loop'] as Plan;
        const hayBest = Math.min(...p.lapTicks.map(ticksToMs));
        await startRace(pg, 'hay-loop');
        const run = await driveRace(pg, p);
        expect(run.lapEnds[0]?.newBest).toBe(true);
        expect(run.finish.stored).toEqual({
          'racer.bestLap.dust-bowl': String(botBest),
          'racer.bestLap.hay-loop': String(hayBest),
        });
        expect(run.finish.results.label.toLowerCase()).toBe('new best lap');
        const dust = await startRace(pg, 'dust-bowl');
        expect(dust.best).toBe(formatTime(botBest));
      }, 300_000);

      it('a faster lap than the stored best shows NEW BEST and overwrites it; slower laps in the same race do not', async () => {
        let pg = await reload();
        // An older, slower record: the bot's best lap beats it by 0.5 s.
        const older = botBest + 500;
        await pg.evaluate((ms) => localStorage.setItem('racer.bestLap.dust-bowl', String(ms)), older);
        pg = await reload();
        const p = fast['dust-bowl'] as Plan;
        const lapMs = p.lapTicks.map(ticksToMs);
        const s = await startRace(pg, 'dust-bowl');
        expect(s.best).toBe(formatTime(older));
        const run = await driveRace(pg, p);
        let best = older;
        run.lapEnds.forEach((e, i) => {
          const ms = lapMs[i] as number;
          expect(e.newBest, `lap ${i + 1} (${ms} ms vs best ${best})`).toBe(ms < best);
          best = Math.min(best, ms);
        });
        expect(run.lapEnds.some((e) => e.newBest)).toBe(true);
        expect(run.finish.stored['racer.bestLap.dust-bowl']).toBe(String(botBest));
        expect(run.finish.results.label.toLowerCase()).toBe('new best lap');
      }, 300_000);
    });
  }
});
