import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/types.ts';
import { createRng, nextFloat } from '../../src/sim/rng.ts';
import type { World } from '../../src/sim/world.ts';
import { carViews, createWorld, raceView, stepWorld } from '../../src/sim/world.ts';
import type { Bot } from '../../src/sim/bot.ts';
import { botsFor, dustBowl, fingerprint } from './helpers.ts';

/** Bots with seeded noise: wobbly steering, random brake taps and lifts. */
function noisyInputs(world: World, bots: Bot[], noise: ReturnType<typeof createRng>): CarInput[] {
  return bots.map((bot) => {
    const base = bot.input(world);
    const r = nextFloat(noise);
    return {
      steer: Math.max(-1, Math.min(1, base.steer + (nextFloat(noise) - 0.5) * 0.9)),
      throttle: r < 0.92 ? base.throttle : false,
      brake: r > 0.97 || base.brake,
    };
  });
}

function simulate(seed: number, ticks: number): World {
  const world = createWorld(dustBowl, { seed, carCount: 3 });
  const bots = botsFor(world);
  const noise = createRng(seed * 31 + 7);
  for (let t = 0; t < ticks; t++) stepWorld(world, noisyInputs(world, bots, noise));
  return world;
}

describe('determinism', () => {
  it('same seed and inputs give bit-identical state after thousands of ticks', () => {
    const a = simulate(2024, 6000);
    const b = simulate(2024, 6000);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(carViews(a)).toEqual(carViews(b));
    expect(raceView(a)).toEqual(raceView(b));
    // The run actually went somewhere (not a trivially static world).
    expect(raceView(a).racers.some((r) => r.lapsCompleted >= 1)).toBe(true);
  });

  it('different seeds give different grids', () => {
    const grids = [1, 2, 3, 4].map((seed) => JSON.stringify(carViews(createWorld(dustBowl, { seed, carCount: 4 }))));
    expect(new Set(grids).size).toBe(4);
  });

  it('grid slots are staggered behind the line, facing the start heading', () => {
    const world = createWorld(dustBowl, { seed: 9, carCount: 4 });
    const h = world.track.layout.startHeading;
    const views = carViews(world);
    const L = world.track.length;
    views.forEach((v, i) => {
      expect(v.heading).toBe(h);
      expect(v.speed).toBe(0);
      expect(v.surface).toBe('dirt');
      const s = world.cars[i]!.pos.s;
      expect(s).toBeGreaterThan(L - 30);
      if (i > 0) expect(s).toBeLessThan(world.cars[i - 1]!.pos.s);
    });
    // Two columns: alternate sides of the centreline.
    expect(Math.sign(world.cars[0]!.pos.lateral)).toBe(-Math.sign(world.cars[1]!.pos.lateral));
  });

  it('quantises steer like the replay format, so tiny differences below int8 do not diverge', () => {
    const w1 = createWorld(dustBowl, { seed: 1, carCount: 1 });
    const w2 = createWorld(dustBowl, { seed: 1, carCount: 1 });
    for (let t = 0; t < 600; t++) {
      stepWorld(w1, [{ steer: 0.3, throttle: true, brake: false }]);
      stepWorld(w2, [{ steer: 0.3 + 1e-4, throttle: true, brake: false }]);
    }
    expect(fingerprint(w1)).toBe(fingerprint(w2));
  });
});
