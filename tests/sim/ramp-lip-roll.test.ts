// Regression: on the reworked Dust Bowl the run-up to the ramp is short, so a car crawling up it
// and then braking still rolls over the lip at walking pace. Its centre drops off the lip while the
// back half of the body is still over the ramp; the drawn body must rest on the lip, not sink into
// the ramp, and the car must still be able to drive on.
import { describe, expect, it } from 'vitest';
import type { CarInput, CarView } from '../../src/sim/types.ts';
import { CAR_LENGTH } from '../../src/sim/car.ts';
import { groundAt } from '../../src/sim/track.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/race.ts';
import { carViews, createWorld, stepWorld, type World } from '../../src/sim/world.ts';
import { GAS, dustBowl } from './helpers.ts';

const HALF = CAR_LENGTH / 2;

/** Deepest point (positive = below ground) of the drawn body's base line, sampled nose to tail. */
function clipDepth(world: World, v: CarView): number {
  const fx = Math.sin(v.heading);
  const fz = -Math.cos(v.heading);
  let worst = -Infinity;
  for (let i = 0; i <= 80; i++) {
    const t = -1 + i / 40;
    const along = t * HALF * Math.cos(v.pitch);
    worst = Math.max(worst, groundAt(world.track, v.x + fx * along, v.z + fz * along).h - (v.y + t * HALF * Math.sin(v.pitch)));
  }
  return worst;
}

describe('rolling off the ramp lip at walking pace', () => {
  it('the body rests on the lip instead of sinking into the ramp, and the car drives on', () => {
    const world = createWorld(dustBowl, { seed: 1, carCount: 1 });
    for (let i = 0; i < COUNTDOWN_TICKS; i++) stepWorld(world, []);
    const lip = world.track.ramps[0]!;
    let braking = false;
    let worst = -Infinity;
    let slowDrop = false;
    const step = (input: CarInput): CarView => {
      stepWorld(world, [input]);
      const v = carViews(world)[0]!;
      worst = Math.max(worst, clipDepth(world, v));
      const pastLip = (v.x - lip.x) * lip.fx + (v.z - lip.z) * lip.fz > 0;
      if (v.airborne && pastLip && Math.abs(v.speed) < 2) slowDrop = true;
      return v;
    };
    // Crawl up the slope (pulsed throttle), then hold the brake from halfway up.
    let last: CarView | undefined;
    for (let t = 0; t < 600; t++) {
      braking ||= (last?.y ?? 0) > 0.5;
      last = step(braking ? { steer: 0, throttle: false, brake: true } : { steer: 0, throttle: t % 4 === 0, brake: false });
    }
    expect(slowDrop).toBe(true);
    expect(worst).toBeLessThan(1e-6);
    // Then drive on: it gets off the lip and away down the straight.
    const before = { x: world.cars[0]!.x, z: world.cars[0]!.z };
    for (let t = 0; t < 120; t++) step(GAS);
    expect(Math.hypot(world.cars[0]!.x - before.x, world.cars[0]!.z - before.z)).toBeGreaterThan(5);
    expect(worst).toBeLessThan(1e-6);
  });
});
