// Determinism of the world itself. Same seed + same inputs = bit-identical state is proven by the
// replay round trip (replay.test.ts), which compares full fingerprints of a live and a replayed run.
import { describe, expect, it } from 'vitest';
import { carViews, createWorld, stepWorld } from '../../src/sim/world.ts';
import { dustBowl, fingerprint } from './helpers.ts';

describe('determinism', () => {
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
