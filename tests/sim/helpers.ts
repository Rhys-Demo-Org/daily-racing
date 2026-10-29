// Test-only helpers for the simulation suites.
import type { CarInput, TrackData } from '../../src/sim/types.ts';
import type { Bot } from '../../src/sim/bot.ts';
import { createBot } from '../../src/sim/bot.ts';
import type { World } from '../../src/sim/world.ts';
import { createWorld, stepWorld } from '../../src/sim/world.ts';
import type { CarState } from '../../src/sim/car.ts';
import { CAR_LENGTH, CAR_TUNING, CAR_WIDTH, DT, SURFACES, forwardSpeed } from '../../src/sim/car.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/race.ts';
import { clamp, headingOf, wrapAngle } from '../../src/sim/vec.ts';
import dustBowlJson from '../../src/content/tracks/dust-bowl.json' with { type: 'json' };

export const dustBowl = dustBowlJson as TrackData;

export const NO_INPUT: CarInput = { steer: 0, throttle: false, brake: false };
export const GAS: CarInput = { steer: 0, throttle: true, brake: false };

/** Largest displacement a car may make in one tick without it counting as a teleport. */
export const MAX_TICK_DISPLACEMENT = SURFACES.dirt.topSpeed * DT * 1.5;

/** Every number in the world, as exact bit patterns, so -0/+0 and last-bit differences show up. */
export function fingerprint(world: World): string {
  const bits = (v: number): string => {
    const f = new Float64Array([v]);
    return Array.from(new Uint32Array(f.buffer), (u) => u.toString(16)).join(':');
  };
  return JSON.stringify({ cars: world.cars, racers: world.racers, tick: world.tick, rng: world.rng }, (_, v) =>
    typeof v === 'number' ? bits(v) : v,
  );
}

/** One bot per car of the world. */
export function botsFor(world: World): Bot[] {
  return world.cars.map((_, i) => createBot(world, i));
}

/** What every car did, gathered by calling `update` after each stepWorld. */
export interface Watch {
  /** Largest horizontal per-tick displacement of any car. */
  maxStep: number;
  /** Longest run of racing ticks an unfinished car spent slower than 1 unit/s. */
  maxSlowTicks: number;
  /** Ticks (summed over cars) a car's centre was on grass. */
  grassTicks: number;
  /** Ticks (summed over cars) a car's footprint was within 0.01 of a prop. */
  propTicks: number;
  update(world: World): void;
}

export function watch(world: World): Watch {
  let prev = world.cars.map((c) => ({ x: c.x, z: c.z }));
  const slow = world.cars.map(() => 0);
  const w: Watch = {
    maxStep: 0,
    maxSlowTicks: 0,
    grassTicks: 0,
    propTicks: 0,
    update(world) {
      world.cars.forEach((car, i) => {
        const p = prev[i]!;
        w.maxStep = Math.max(w.maxStep, Math.hypot(car.x - p.x, car.z - p.z));
        const crawling = world.tick > COUNTDOWN_TICKS && world.racers[i]!.finishTick === null && Math.abs(forwardSpeed(car)) < 1;
        slow[i] = crawling ? slow[i]! + 1 : 0;
        w.maxSlowTicks = Math.max(w.maxSlowTicks, slow[i]!);
        if (car.surface === 'grass') w.grassTicks++;
        if (touchesProp(world, car)) w.propTicks++;
      });
      prev = world.cars.map((c) => ({ x: c.x, z: c.z }));
    },
  };
  return w;
}

/** True when the car's footprint is within 0.01 of any prop collider. Independent of car.ts. */
function touchesProp(world: World, car: CarState): boolean {
  const corners = carCorners(car.x, car.z, car.heading);
  return world.track.colliders.some((c) => {
    if ((c.x - car.x) ** 2 + (c.z - car.z) ** 2 > 25) return false;
    return c.shape === 'circle'
      ? circleOverlap(car.x, car.z, car.heading, c.x, c.z, c.r + 0.01) > 0
      : polygonOverlap(corners, boxCorners(c.x, c.z, c.heading, c.halfLength + 0.01, c.halfWidth + 0.01)) > 0;
  });
}

export interface BotRace {
  world: World;
  bots: Bot[];
  seen: Watch;
  /** Lap times in seconds, per car. */
  lapSeconds: number[][];
  /** Every car finished. */
  finished: boolean;
}

/** Runs a race with every car driven by its bot, until all cars finish or `maxTicks` pass. */
export function runBotRace(track: TrackData, seed: number, carCount = 1, maxTicks = 60 * 240): BotRace {
  const world = createWorld(track, { seed, carCount });
  const bots = botsFor(world);
  const seen = watch(world);
  for (let t = 0; t < maxTicks && world.racers.some((r) => r.finishTick === null); t++) {
    stepWorld(world, bots.map((b) => b.input(world)));
    seen.update(world);
  }
  return {
    world,
    bots,
    seen,
    lapSeconds: world.racers.map((r) => r.lapTicks.map((t) => t * DT)),
    finished: world.racers.every((r) => r.finishTick !== null),
  };
}

/** Steps the world `n` ticks with the same input for car 0 (other cars get no input). */
export function stepN(world: World, n: number, input: CarInput): void {
  for (let i = 0; i < n; i++) stepWorld(world, [input]);
}

/** Steers car 0 toward a world point at full throttle. */
export function driveToward(world: World, x: number, z: number, carIndex = 0): CarInput {
  const car = world.cars[carIndex];
  if (car === undefined) return NO_INPUT;
  const desired = headingOf(x - car.x, z - car.z);
  return { steer: clamp(wrapAngle(desired - car.heading) * 2.5, -1, 1), throttle: true, brake: false };
}

/**
 * Test strip: a long closed loop whose southern leg (z = 0) is dead straight from x = −300 to
 * x = 300, driven eastward (heading π/2). Index 0 / s = 0 is at (0, 0).
 */
export function stripTrack(extra: Partial<TrackData> = {}): TrackData {
  return {
    id: 'test-strip',
    name: 'Test Strip',
    laps: 3,
    width: 8.4,
    centreline: [
      [0, 0], [300, 0], [600, 0], [700, 150], [600, 300], [0, 300],
      [-600, 300], [-700, 150], [-600, 0], [-300, 0],
    ],
    ramps: [],
    propRows: [],
    props: [],
    ...extra,
  };
}

/**
 * Hairpin fixture: leg A runs east along z = 0, turns through a tight hairpin at x ≈ 200 and comes
 * back west as leg B along z = −16. The legs' edges are 7.6 apart, so there is grass between them.
 */
export function hairpinTrack(): TrackData {
  return {
    id: 'test-hairpin',
    name: 'Test Hairpin',
    laps: 1,
    width: 8.4,
    centreline: [
      [0, 0], [60, 0], [120, 0], [180, 0], [194, -2], [200, -8], [194, -14], [180, -16],
      [120, -16], [60, -16], [0, -16], [-40, -32], [-60, -70], [-120, -60], [-140, 0],
      [-100, 30], [-50, 12],
    ],
    ramps: [],
    propRows: [],
    props: [],
  };
}

/** Corners of the car's footprint (world XZ). */
export function carCorners(x: number, z: number, heading: number): [number, number][] {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const hl = CAR_LENGTH / 2;
  const hw = CAR_WIDTH / 2;
  return [
    [x + fx * hl - fz * hw, z + fz * hl + fx * hw],
    [x + fx * hl + fz * hw, z + fz * hl - fx * hw],
    [x - fx * hl + fz * hw, z - fz * hl - fx * hw],
    [x - fx * hl - fz * hw, z - fz * hl + fx * hw],
  ];
}

/** Penetration depth of a circle into the car footprint (0 when apart). Independent of car.ts. */
export function circleOverlap(x: number, z: number, heading: number, cx: number, cz: number, r: number): number {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const lx = (cx - x) * fx + (cz - z) * fz;
  const ly = (cx - x) * -fz + (cz - z) * fx;
  const hl = CAR_LENGTH / 2;
  const hw = CAR_WIDTH / 2;
  if (Math.abs(lx) <= hl && Math.abs(ly) <= hw) return r + Math.min(hl - Math.abs(lx), hw - Math.abs(ly));
  const d = Math.hypot(lx - clamp(lx, -hl, hl), ly - clamp(ly, -hw, hw));
  return Math.max(0, r - d);
}

/** Overlap depth of two convex polygons by the separating axis theorem (0 when apart). */
export function polygonOverlap(a: [number, number][], b: [number, number][]): number {
  let min = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as [number, number];
      const q = poly[(i + 1) % poly.length] as [number, number];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ax = -(q[1] - p[1]) / len;
      const az = (q[0] - p[0]) / len;
      const proj = (pts: [number, number][]): [number, number] => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of pts) {
          const d = v[0] * ax + v[1] * az;
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
        }
        return [lo, hi];
      };
      const [alo, ahi] = proj(a);
      const [blo, bhi] = proj(b);
      const overlap = Math.min(ahi, bhi) - Math.max(alo, blo);
      if (overlap <= 0) return 0;
      min = Math.min(min, overlap);
    }
  }
  return min;
}

/** Corners of an oriented box (hay bale) with half extents along / across its heading. */
export function boxCorners(x: number, z: number, heading: number, halfLength: number, halfWidth: number): [number, number][] {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  return [
    [x + fx * halfLength - fz * halfWidth, z + fz * halfLength + fx * halfWidth],
    [x + fx * halfLength + fz * halfWidth, z + fz * halfLength - fx * halfWidth],
    [x - fx * halfLength + fz * halfWidth, z - fz * halfLength - fx * halfWidth],
    [x - fx * halfLength - fz * halfWidth, z - fz * halfLength + fx * halfWidth],
  ];
}

export { CAR_TUNING };
