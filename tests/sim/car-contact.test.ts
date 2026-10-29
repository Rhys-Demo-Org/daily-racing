// Car–car collisions (src/sim/car.ts): oriented boxes pushed apart half each, an impulse along the
// contact normal with some speed bleed, no tunnelling, and bit-identical replays.
import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/types.ts';
import type { CarState } from '../../src/sim/car.ts';
import { CAR_LENGTH, CAR_WIDTH, SURFACES, createCar, forwardSpeed, stepCars } from '../../src/sim/car.ts';
import { createRng, nextFloat } from '../../src/sim/rng.ts';
import { buildTrack, validateTrack } from '../../src/sim/track.ts';
import { createWorld, stepWorld } from '../../src/sim/world.ts';
import { GAS, MAX_TICK_DISPLACEMENT, NO_INPUT, boxCorners, fingerprint, polygonOverlap, stripTrack } from './helpers.ts';

const track = buildTrack(validateTrack(stripTrack()));
const TOP = SURFACES.dirt.topSpeed;
const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;

/** A car on the strip at (x, z) facing `heading`, already moving forward at `speed`. */
function car(x: number, z: number, heading: number, speed: number): CarState {
  const c = createCar(track, x, z, heading);
  c.vx = Math.sin(heading) * speed;
  c.vz = -Math.cos(heading) * speed;
  return c;
}

/** Overlap depth of the two footprints, grown by `grow` on every side (0 when apart). */
function overlap(a: CarState, b: CarState, grow = 0): number {
  const box = (c: CarState) => boxCorners(c.x, c.z, c.heading, CAR_LENGTH / 2 + grow, CAR_WIDTH / 2 + grow);
  return polygonOverlap(box(a), box(b));
}

/** Steps the pair, checking after every tick that they don't overlap and neither moves more than
 * `maxStep` (a teleport). Returns how many ticks they were in contact. */
function crash(a: CarState, b: CarState, ticks: number, inputs: CarInput[], each?: () => void, maxStep = MAX_TICK_DISPLACEMENT): number {
  let contacts = 0;
  for (let i = 0; i < ticks; i++) {
    const [ax, az, bx, bz] = [a.x, a.z, b.x, b.z];
    stepCars([a, b], inputs, track);
    expect(overlap(a, b), `overlap after tick ${i}`).toBeLessThan(1e-6);
    expect(Math.hypot(a.x - ax, a.z - az)).toBeLessThan(maxStep);
    expect(Math.hypot(b.x - bx, b.z - bz)).toBeLessThan(maxStep);
    if (overlap(a, b, 0.01) > 0) contacts++;
    each?.();
  }
  return contacts;
}

describe('car–car collisions', () => {
  it('a head-on hit at top speed separates the cars and stops them dead', () => {
    const a = car(-20, 0, EAST, TOP);
    const b = car(20, 0, WEST, TOP);
    let slowest = Infinity;
    const contacts = crash(a, b, 90, [GAS, GAS], () => {
      slowest = Math.min(slowest, Math.hypot(a.vx, a.vz));
    });
    expect(contacts).toBeGreaterThan(0);
    expect(slowest).toBeLessThan(TOP * 0.3);
    expect(a.x).toBeLessThan(b.x - CAR_LENGTH + 1e-6);
  });

  it('a side impact pushes the struck car sideways and slows the striker', () => {
    const a = car(-15, 0, EAST, TOP);
    const b = car(0, 0, 0, 0); // parked across a's path, facing north
    crash(a, b, 60, [GAS, NO_INPUT]);
    expect(b.x).toBeGreaterThan(0.5);
    expect(a.x).toBeLessThan(b.x - CAR_LENGTH / 2 - CAR_WIDTH / 2 + 1e-6);
    expect(Math.hypot(a.vx, a.vz)).toBeLessThan(TOP * 0.6);
  });

  it('never tunnels through another car at max closing speed (and well beyond)', () => {
    for (const speed of [TOP, TOP * 2.5]) {
      for (const lateral of [0, 0.6, -0.6, 1.5, -1.5]) {
        for (const reversing of [false, true]) {
          // b drives west at a head on, or faces east and reverses into it.
          const a = car(-20, 0, EAST, speed);
          const b = reversing ? car(20, lateral, EAST, -speed) : car(20, lateral, WEST, speed);
          const bInput = reversing ? { steer: 0, throttle: false, brake: true } : GAS;
          const inOrder = (): void => {
            expect(a.x, `speed ${speed} lateral ${lateral} reversing ${reversing}`).toBeLessThan(b.x);
          };
          crash(a, b, 90, [GAS, bInput], inOrder, (MAX_TICK_DISPLACEMENT * speed) / TOP);
        }
      }
    }
  });

  it('a rear-end hit exchanges an impulse: the faster car slows and the slower one speeds up', () => {
    const a = car(-10, 0, EAST, 20);
    const b = car(0, 0, EAST, 10);
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      const [va, vb] = [forwardSpeed(a), forwardSpeed(b)];
      stepCars([a, b], [NO_INPUT, NO_INPUT], track);
      if (forwardSpeed(b) > vb) {
        hit = true;
        expect(forwardSpeed(a)).toBeLessThan(va - 1);
        expect(forwardSpeed(b)).toBeGreaterThan(vb + 1);
      }
    }
    expect(hit).toBe(true);
  });

  it('a car flying over another passes, but not when their heights overlap', () => {
    const fly = (y: number): [CarState, CarState] => {
      const flyer = car(-8, 0, EAST, 20);
      flyer.airborne = true;
      flyer.y = y;
      flyer.vy = y > 1 ? 5 : 0;
      const parked = car(0, 0, EAST, 0);
      for (let i = 0; i < 40; i++) stepCars([flyer, parked], [NO_INPUT, NO_INPUT], track);
      return [flyer, parked];
    };
    const [high, under] = fly(4);
    expect(high.x).toBeGreaterThan(CAR_LENGTH);
    expect(under.x).toBe(0);
    const [low, hit] = fly(0.6);
    expect(low.x).toBeLessThan(hit.x);
    expect(hit.x).toBeGreaterThan(0);
  });

  it('two cars with the same seed and inputs give bit-identical state, contacts included', () => {
    const run = (): { print: string; contacts: number } => {
      const world = createWorld(stripTrack(), { seed: 3, carCount: 2 });
      // Car 1 turned round 40 units up car 0's lane, so the cars meet head-on and then shove about.
      world.cars[1] = createCar(world.track, 40, world.cars[0]!.z, WEST);
      const noise = createRng(9);
      let contacts = 0;
      for (let t = 0; t < 900; t++) {
        stepWorld(world, [0, 1].map(() => ({ steer: (nextFloat(noise) - 0.5) * 0.6, throttle: nextFloat(noise) < 0.9, brake: false })));
        if (overlap(world.cars[0]!, world.cars[1]!, 0.01) > 0) contacts++;
      }
      return { print: fingerprint(world), contacts };
    };
    const first = run();
    expect(first.contacts).toBeGreaterThan(10);
    expect(run().print).toBe(first.print);
  });
});
