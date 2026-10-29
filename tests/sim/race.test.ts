import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/types.ts';
import type { RacerState } from '../../src/sim/race.ts';
import {
  COUNTDOWN_TICKS,
  sectorCount,
  countdownValue,
  createRacer,
  positions,
  raceDistance,
  updateRacer,
} from '../../src/sim/race.ts';
import type { World } from '../../src/sim/world.ts';
import { carViews, createWorld, raceView, stepWorld } from '../../src/sim/world.ts';
import { sampleAt } from '../../src/sim/track.ts';
import { createBot } from '../../src/sim/bot.ts';
import { GAS, NO_INPUT, driveToward, dustBowl, runBotRace, stepN } from './helpers.ts';

const L = 1000;
const SECTOR = L / sectorCount(L);

/** Feeds a sequence of arc lengths to a racer one tick at a time. */
function feed(r: RacerState, path: number[], laps = 3, startTick = 1): void {
  path.forEach((s, i) => updateRacer(r, ((s % L) + L) % L, L, startTick + i, laps));
}

/** Arc lengths from a to b (may exceed L / go negative) in steps of `step`. */
function span(a: number, b: number, step = 0.5): number[] {
  const out: number[] = [];
  const dir = b >= a ? 1 : -1;
  for (let s = a; dir > 0 ? s <= b : s >= b; s += step * dir) out.push(s);
  return out;
}

describe('countdown', () => {
  it('counts 3, 2, 1, then GO at tick 180, and nothing moves until then', () => {
    const world = createWorld(dustBowl, { seed: 1, carCount: 2 });
    const start = carViews(world);
    const seen: number[] = [];
    for (let t = 0; t < COUNTDOWN_TICKS; t++) {
      const view = raceView(world);
      expect(view.phase).toBe('countdown');
      expect(view.raceTick).toBe(0);
      if (seen[seen.length - 1] !== view.countdown) seen.push(view.countdown);
      stepWorld(world, [GAS, { steer: 1, throttle: true, brake: false }]);
      expect(carViews(world)).toEqual(start);
    }
    expect(seen).toEqual([3, 2, 1]);
    expect(COUNTDOWN_TICKS).toBe(180);
    const go = raceView(world);
    expect(go.phase).toBe('racing');
    expect(go.countdown).toBe(0);
    expect(go.raceTick).toBe(0);
    stepWorld(world, [GAS, GAS]);
    expect(raceView(world).raceTick).toBe(1);
    expect(carViews(world)[0]!.x).toBeGreaterThan(start[0]!.x);
  });

  it('countdownValue switches every 60 ticks', () => {
    expect(countdownValue(0)).toBe(3);
    expect(countdownValue(59)).toBe(3);
    expect(countdownValue(60)).toBe(2);
    expect(countdownValue(120)).toBe(1);
    expect(countdownValue(179)).toBe(1);
    expect(countdownValue(180)).toBe(0);
  });
});

describe('lap counting rules', () => {
  it('the first crossing from the grid starts lap 1; a full lap in order counts', () => {
    const r = createRacer(L - 10, L);
    feed(r, span(L - 10, L + 5));
    expect(r.started).toBe(true);
    expect(r.lapsCompleted).toBe(0);
    feed(r, span(5, L + 5), 3, 100);
    expect(r.lapsCompleted).toBe(1);
    expect(r.lapTicks).toHaveLength(1);
  });

  it('driving backwards over the line does not count, even round and round', () => {
    const r = createRacer(L - 10, L);
    feed(r, span(L - 10, L + 20)); // start
    feed(r, span(20, -20)); // reverse back over the line
    feed(r, span(-20, 20)); // and forward again
    expect(r.lapsCompleted).toBe(0);
    // Several whole laps backwards.
    feed(r, span(20, 20 - 5 * L));
    expect(r.lapsCompleted).toBe(0);
  });

  it('skipping sectors (a shortcut) never completes a lap', () => {
    const r = createRacer(L - 10, L);
    feed(r, span(L - 10, L + 20));
    // Jump from sector 0 straight to sector 4, then drive on to the line and beyond.
    feed(r, span(4 * SECTOR + 1, L + 20));
    expect(r.lapsCompleted).toBe(0);
    // Going back and doing it properly from the missed sector onwards works again.
    feed(r, span(20, L + 20));
    expect(r.lapsCompleted).toBe(1);
  });

  it('on a long lap sectors stay short, so a cut across a single old 8-sector boundary no longer counts', () => {
    // A 2 km lap: 50 sectors of 40 units, where a fixed 8 would each have been 250 long.
    const long = 2000;
    expect(sectorCount(long)).toBe(50);
    expect(sectorCount(200)).toBe(8);
    // Start, then cut from s = 10 to s = 490: with 8 sectors that only crosses one boundary
    // (sector 0 → 1) so it was credited, skipping 480 units of track. Then drive on over the line.
    expect([10, 490].map((s) => Math.floor((s / long) * 8))).toEqual([0, 1]);
    const r = createRacer(long - 10, long);
    const path = [...span(long - 10, long + 10), ...span(490, long + 20)];
    path.forEach((s, i) => updateRacer(r, s % long, long, i + 1, 3));
    expect(r.lapsCompleted).toBe(0);
  });

  it('finishes after the last lap and stops counting', () => {
    const r = createRacer(L - 10, L);
    feed(r, span(L - 10, 3 * L + 20), 2);
    expect(r.lapsCompleted).toBe(2);
    expect(r.finishTick).not.toBeNull();
    feed(r, span(20, L + 20), 2);
    expect(r.lapsCompleted).toBe(2);
  });

  it('ranks by laps and validated progress, finished cars by finish tick', () => {
    const a = createRacer(L - 10, L);
    const b = createRacer(L - 10, L);
    feed(a, span(L - 10, L + 300));
    feed(b, span(L - 10, L + 200));
    const da = raceDistance(a, 300, L);
    const db = raceDistance(b, 200, L);
    expect(positions([a, b], [da, db])).toEqual([1, 2]);
    // A shortcut into a later sector does not count as progress.
    const cheat = createRacer(L - 10, L);
    feed(cheat, span(L - 10, L + 20));
    feed(cheat, [700]);
    expect(raceDistance(cheat, 700, L)).toBeLessThanOrEqual(SECTOR);
    // Finished cars rank ahead by finish tick.
    const f1 = { ...createRacer(0, L), finishTick: 900 };
    const f2 = { ...createRacer(0, L), finishTick: 800 };
    expect(positions([f1, a, f2], [0, da, 0])).toEqual([2, 3, 1]);
  });
});

/** Steps with car 0 driven by `drive` until `until` is true or `max` ticks pass. */
function driveUntil(world: World, drive: (w: World) => CarInput, until: (w: World) => boolean, max: number): number {
  for (let i = 0; i < max; i++) {
    if (until(world)) return i;
    stepWorld(world, [drive(world)]);
  }
  throw new Error('driveUntil: condition not reached');
}

describe('laps on Dust Bowl', () => {
  it('reversing back over the line after the start does not count a lap', () => {
    const world = createWorld(dustBowl, { seed: 3, carCount: 1 });
    const bot = createBot(world, 0);
    stepN(world, COUNTDOWN_TICKS, NO_INPUT);
    const L = world.track.length;
    driveUntil(world, bot.input, (w) => w.cars[0]!.pos.s > 30 && w.cars[0]!.pos.s < L / 2, 600);
    expect(world.racers[0]!.started).toBe(true);
    // Reverse until well behind the line, then drive forward across it again.
    driveUntil(world, () => ({ steer: 0, throttle: false, brake: true }), (w) => w.cars[0]!.pos.s > L - 15, 900);
    driveUntil(world, bot.input, (w) => w.cars[0]!.pos.s > 40 && w.cars[0]!.pos.s < L / 2, 900);
    const view = raceView(world).racers[0]!;
    expect(view.lapsCompleted).toBe(0);
    expect(view.lap).toBe(1);
  });

  it('cutting across the infield does not count a lap', () => {
    const world = createWorld(dustBowl, { seed: 4, carCount: 1 });
    const bot = createBot(world, 0);
    stepN(world, COUNTDOWN_TICKS, NO_INPUT);
    const L = world.track.length;
    // Past the ramp, then turn left across the infield onto the top straight.
    driveUntil(world, bot.input, (w) => w.cars[0]!.pos.s > 0.12 * L && w.cars[0]!.pos.s < L / 2, 900);
    const target = sampleAt(world.track, 0.47 * L);
    driveUntil(
      world,
      (w) => driveToward(w, target.x, target.z),
      (w) => Math.hypot(w.cars[0]!.x - target.x, w.cars[0]!.z - target.z) < 4,
      900,
    );
    // Tracking re-acquired the top straight (sector 3), skipping the east turn.
    expect(world.cars[0]!.pos.s).toBeGreaterThan(0.44 * L);
    // Follow the track home and over the line.
    let wrapped = false;
    driveUntil(
      world,
      bot.input,
      (w) => {
        if (w.cars[0]!.pos.s > 0.95 * L) wrapped = true;
        return wrapped && w.cars[0]!.pos.s < 30;
      },
      60 * 40,
    );
    expect(raceView(world).racers[0]!.lapsCompleted).toBe(0);
    // The skipped sectors still have to be driven: one more proper lap counts.
    driveUntil(world, bot.input, (w) => w.racers[0]!.lapsCompleted === 1, 60 * 60);
  });

  it('a full race finishes after 3 laps with consistent lap times', () => {
    const race = runBotRace(dustBowl, 11);
    const view = raceView(race.world);
    const me = view.racers[0]!;
    expect(view.phase).toBe('finished');
    expect(me.lapsCompleted).toBe(3);
    expect(me.lap).toBe(3);
    expect(me.lapTicks).toHaveLength(3);
    expect(me.finishTick).toBe(me.lapTicks.reduce((a, b) => a + b, 0));
    expect(me.finishTick).toBe(view.raceTick);
    expect(me.position).toBe(1);
  });

  it('positions follow race progress between cars', () => {
    const world = createWorld(dustBowl, { seed: 5, carCount: 2 });
    stepN(world, COUNTDOWN_TICKS, NO_INPUT);
    // Car 1 starts behind car 0; only car 1 drives.
    const bot = createBot(world, 1);
    for (let i = 0; i < 60 * 5; i++) stepWorld(world, [NO_INPUT, bot.input(world)]);
    const view = raceView(world);
    expect(view.racers[1]!.position).toBe(1);
    expect(view.racers[0]!.position).toBe(2);
  });
});
