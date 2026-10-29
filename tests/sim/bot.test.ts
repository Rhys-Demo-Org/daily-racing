// The bot (src/sim/bot.ts) is both the race opponent and the driver of the bot-lap gate, so it must
// finish every registered track, never get stuck and never teleport, alone or racing another car.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrackData } from '../../src/sim/types.ts';
import { BOT_TUNING, createBot } from '../../src/sim/bot.ts';
import { CAR_LENGTH, SURFACES, createCar, forwardSpeed } from '../../src/sim/car.ts';
import { HAY_BALE_WIDTH, sampleAt } from '../../src/sim/track.ts';
import type { World } from '../../src/sim/world.ts';
import { createWorld, stepWorld } from '../../src/sim/world.ts';
import { MAX_TICK_DISPLACEMENT, dustBowl, runBotRace, watch } from './helpers.ts';

const TRACK_DIR = join(import.meta.dirname, '../../src/content/tracks');
const TRACKS = readdirSync(TRACK_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(TRACK_DIR, f), 'utf8')) as TrackData);

describe('bots on every registered track', () => {
  for (const track of TRACKS) {
    for (const seed of [1, 2, 3, 42, 1234]) {
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
  for (const seed of [1, 7, 42, 2024, 99991]) {
    it(`laps alone in about 40 s, on the dirt and clear of every prop (seed ${seed})`, () => {
      const { seen, lapSeconds, finished } = runBotRace(dustBowl, seed);
      expect(finished).toBe(true);
      for (const lap of lapSeconds[0]!) {
        expect(lap).toBeGreaterThanOrEqual(38);
        expect(lap).toBeLessThanOrEqual(45);
      }
      expect(seen.grassTicks).toBe(0);
      expect(seen.propTicks).toBe(0);
      expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
    });
  }

  it('a full grid of four bots all finish without getting stuck or teleporting', () => {
    const { seen, finished } = runBotRace(dustBowl, 5, 4);
    expect(finished).toBe(true);
    expect(seen.maxSlowTicks).toBeLessThan(BOT_TUNING.stuckTicks);
    expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
  });

  it('bots vary with the seed and car index, and the same seed gives the same bot', () => {
    const world = (seed: number): World => createWorld(dustBowl, { seed, carCount: 2 });
    const look = (seed: number, car: number): string => {
      const bot = createBot(world(seed), car);
      return `${bot.offset} ${bot.pace}`;
    };
    expect(look(1, 1)).toBe(look(1, 1));
    expect(new Set([look(1, 0), look(1, 1), look(2, 0), look(2, 1)]).size).toBe(4);
    for (const seed of [1, 2, 3, 42, 1234]) {
      const bot = createBot(world(seed), 1);
      expect(Math.abs(bot.offset)).toBeLessThanOrEqual(BOT_TUNING.lineSpread);
      expect(bot.pace).toBeGreaterThanOrEqual(BOT_TUNING.paceMin);
      expect(bot.pace).toBeLessThanOrEqual(BOT_TUNING.paceMax);
    }
  });
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
    let reversed = false;
    for (let t = 0; t < 60 * 90 && world.racers[0]!.lapsCompleted < 1; t++) {
      stepWorld(world, [bot.input(world)]);
      seen.update(world);
      reversed ||= forwardSpeed(world.cars[0]!) < -2;
    }
    return { reversed, laps: world.racers[0]!.lapsCompleted, seen };
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
