// The bot (src/sim/bot.ts) is both the race opponent and the driver of the bot-lap gate, so it must
// finish every registered track, never get stuck and never teleport, alone or racing another car.
import { describe, expect, it } from 'vitest';
import type { TrackData } from '../../src/sim/types.ts';
import { BOT_TUNING, createBot } from '../../src/sim/bot.ts';
import { CAR_LENGTH, SURFACES, createCar } from '../../src/sim/car.ts';
import { HAY_BALE_WIDTH, sampleAt } from '../../src/sim/track.ts';
import type { World } from '../../src/sim/world.ts';
import { createWorld, stepWorld } from '../../src/sim/world.ts';
import {
  MAX_TICK_DISPLACEMENT,
  TRACKS,
  baleHairpinTrack,
  dustBowl,
  hairpinTrack,
  rampCornerTrack,
  runBotRace,
  watch,
} from './helpers.ts';

const SEEDS = [1, 2, 3, 42, 1234];

describe('bots on every registered track', () => {
  for (const track of TRACKS) {
    for (const seed of SEEDS) {
      it(`${track.id}: two bots finish every lap inside the lap-time bounds, never stuck, no teleports (seed ${seed})`, () => {
        const { world, seen, lapSeconds, finished } = runBotRace(track, seed, 2);
        // A lap at top speed along the centreline; the bot's line and pace make real laps a bit slower.
        const ideal = world.track.length / SURFACES.dirt.topSpeed;
        expect(finished).toBe(true);
        for (const laps of lapSeconds) {
          expect(laps).toHaveLength(track.laps);
          for (const lap of laps) {
            expect(lap).toBeGreaterThan(ideal * 0.9);
            expect(lap).toBeLessThan(ideal * 1.5);
          }
        }
        expect(seen.maxSlowTicks).toBeLessThan(BOT_TUNING.stuckTicks);
        expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
      });
    }
  }
});

describe('bot on Dust Bowl', () => {
  const rows: [cars: number, seed: number][] = [[1, 1], [1, 7], [1, 42], [1, 2024], [1, 99991], [4, 5]];
  for (const [cars, seed] of rows) {
    it(`${cars} car(s), seed ${seed}: all finish, never stuck, no teleports${cars === 1 ? '; laps in about 40 s on the dirt, clear of every prop' : ''}`, () => {
      const { seen, lapSeconds, finished } = runBotRace(dustBowl, seed, cars);
      expect(finished).toBe(true);
      expect(seen.maxSlowTicks).toBeLessThan(BOT_TUNING.stuckTicks);
      expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
      if (cars > 1) return;
      for (const lap of lapSeconds[0]!) {
        expect(lap).toBeGreaterThanOrEqual(38);
        expect(lap).toBeLessThanOrEqual(45);
      }
      expect(seen.grassTicks).toBe(0);
      expect(seen.propTicks).toBe(0);
    });
  }

  it('bots vary with the seed and the car, and the same seed gives the same race', () => {
    const firstLaps = (seed: number, cars: number): number[] => runBotRace(dustBowl, seed, cars).lapSeconds.map((l) => l[0]!);
    expect(new Set([1, 2, 3].map((seed) => firstLaps(seed, 1)[0])).size).toBe(3);
    const [a, b] = firstLaps(1, 2);
    expect(a).not.toBe(b);
    expect(firstLaps(1, 2)).toEqual([a, b]);
  });
});

describe('bots on hard corners', () => {
  for (const seed of SEEDS) {
    it(`a tight hairpin: on the dirt all lap, within 20% of the ideal lap time (seed ${seed})`, () => {
      const { world, seen, lapSeconds, finished } = runBotRace(hairpinTrack(), seed);
      expect(finished).toBe(true);
      expect(seen.grassTicks).toBe(0);
      expect(lapSeconds[0]![0]).toBeLessThan((world.track.length / SURFACES.dirt.topSpeed) * 1.2);
    });

    for (const [name, track] of [['a ramp just before a corner lined with tyres', rampCornerTrack()], ['a hairpin with bales on the inside', baleHairpinTrack()]] as const) {
      it(`${name}: one or two bots finish without ever needing to recover (seed ${seed})`, () => {
        for (const cars of [1, 2]) {
          const { seen, finished } = runBotRace(track, seed, cars);
          expect(finished).toBe(true);
          expect(seen.reversals).toBe(0);
          expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
        }
      });
    }
  }
});

describe('stuck recovery', () => {
  /**
   * Puts car 0 where `place` says, then lets its bot drive until it completes a lap. Returns
   * whether it ever reversed (the recovery), the lap count and what the watcher saw.
   */
  function escape(track: TrackData, place: (world: World) => [number, number, number]) {
    const world = createWorld(track, { seed: 1, carCount: 1 });
    const [x, z, heading] = place(world);
    world.cars[0] = createCar(world.track, x, z, heading);
    const bot = createBot(world, 0);
    const seen = watch(world);
    for (let t = 0; t < 60 * 90 && world.racers[0]!.lapsCompleted < 1; t++) {
      stepWorld(world, [bot.input(world)]);
      seen.update(world);
    }
    return { reversed: seen.reversals > 0, laps: world.racers[0]!.lapsCompleted, seen };
  }

  it('a bot facing a wall of hay bales backs off and completes a lap', () => {
    // A row of bales just off the left edge before the start line, and the car nose-on to it.
    const offset = 1;
    const track: TrackData = {
      ...dustBowl,
      propRows: [...dustBowl.propRows, { kind: 'hay-bale', side: 'left', from: 0.96, to: 1, spacing: 2.1, offset }],
    };
    const { reversed, laps, seen } = escape(track, (world) => {
      const p = sampleAt(world.track, world.track.length - 20);
      const face = world.track.halfWidth + offset - HAY_BALE_WIDTH / 2;
      const left = face - CAR_LENGTH / 2 - 0.05; // nose 0.05 from the bales
      return [p.x - Math.cos(p.heading) * left, p.z - Math.sin(p.heading) * left, p.heading - Math.PI / 2];
    });
    expect(reversed).toBe(true);
    expect(laps).toBe(1);
    expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
  });

  it('a bot wedged nose-first into a dead-end pocket of bales, facing the wrong way, reverses out and completes a lap', () => {
    // On the straight east of the start line (z = 78, driven east, s = x + 63): bales along both
    // sides of x ∈ [36, 42] and two across its west end. The car faces west into the dead end.
    const length = createWorld(dustBowl, { seed: 1, carCount: 1 }).track.length;
    const side = (s: 'left' | 'right') => ({ kind: 'hay-bale' as const, side: s, from: 100 / length, to: 106 / length, spacing: 2.1, offset: -1.9 });
    const track: TrackData = {
      ...dustBowl,
      propRows: [...dustBowl.propRows, side('left'), side('right')],
      props: [...dustBowl.props, { kind: 'hay-bale', x: 37.2, z: 77 }, { kind: 'hay-bale', x: 37.2, z: 79 }],
    };
    const { reversed, laps, seen } = escape(track, () => [40, 78, -Math.PI / 2]);
    expect(reversed).toBe(true);
    expect(laps).toBe(1);
    expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
  });
});
