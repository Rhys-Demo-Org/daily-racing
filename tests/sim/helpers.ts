// Test-only helpers for the simulation suites. The real bot is a later milestone (src/sim/bot.ts);
// this autopilot is deliberately simple and lives in tests.
import type { CarInput, CarView, TrackData } from '../../src/sim/types.ts';
import type { World } from '../../src/sim/world.ts';
import { carViews, createWorld, raceView, stepWorld } from '../../src/sim/world.ts';
import { CAR_LENGTH, CAR_TUNING, CAR_WIDTH, DT, SURFACES, forwardSpeed } from '../../src/sim/car.ts';
import { sampleAt } from '../../src/sim/track.ts';
import { clamp, headingOf, wrapAngle } from '../../src/sim/vec.ts';
import dustBowlJson from '../../src/content/tracks/dust-bowl.json' with { type: 'json' };

export const dustBowl = dustBowlJson as TrackData;

export const NO_INPUT: CarInput = { steer: 0, throttle: false, brake: false };
export const GAS: CarInput = { steer: 0, throttle: true, brake: false };

/** Sideways acceleration the autopilot plans corners with (a bit under dirt grip). */
const PLAN_LATERAL = 20;

/**
 * Centreline follower: steers toward a look-ahead point on the centreline and lifts or brakes
 * when the curvature ahead calls for a lower speed.
 */
export function autopilot(world: World, carIndex = 0): CarInput {
  const car = world.cars[carIndex];
  if (car === undefined) return NO_INPUT;
  const track = world.track;
  const speed = forwardSpeed(car);
  const look = 7 + Math.abs(speed) * 0.4;
  const target = sampleAt(track, car.pos.s + look);
  const desired = headingOf(target.x - car.x, target.z - car.z);
  const steer = clamp(wrapAngle(desired - car.heading) * 2.5, -1, 1);

  let maxCurvature = 0;
  const horizon = 10 + Math.abs(speed) * 1.2;
  for (let d = 0; d < horizon; d += 2) {
    const a = sampleAt(track, car.pos.s + d);
    const b = sampleAt(track, car.pos.s + d + 4);
    maxCurvature = Math.max(maxCurvature, Math.abs(wrapAngle(b.heading - a.heading)) / 4);
  }
  const targetSpeed = maxCurvature > 1e-6 ? Math.sqrt(PLAN_LATERAL / maxCurvature) : Infinity;
  return { steer, throttle: speed < targetSpeed, brake: speed > targetSpeed + 4 };
}

/** Largest displacement a car may make in one tick without it counting as a teleport. */
export const MAX_TICK_DISPLACEMENT = SURFACES.dirt.topSpeed * DT * 1.5;

export interface AutopilotRace {
  world: World;
  /** Lap times in seconds for car 0. */
  lapSeconds: number[];
  finished: boolean;
  /** Largest horizontal per-tick displacement of any car. */
  maxStep: number;
  ticks: number;
}

/** Runs a full race with every car on autopilot, until car 0 finishes or `maxTicks` pass. */
export function runAutopilotRace(track: TrackData, seed: number, carCount = 1, maxTicks = 60 * 200): AutopilotRace {
  const world = createWorld(track, { seed, carCount });
  let prev: CarView[] = carViews(world);
  let maxStep = 0;
  let ticks = 0;
  while (ticks < maxTicks && raceView(world).phase !== 'finished') {
    const inputs = world.cars.map((_, i) => autopilot(world, i));
    stepWorld(world, inputs);
    ticks++;
    const now = carViews(world);
    now.forEach((c, i) => {
      const p = prev[i] as CarView;
      maxStep = Math.max(maxStep, Math.hypot(c.x - p.x, c.z - p.z));
    });
    prev = now;
  }
  const racer = raceView(world).racers[0];
  return {
    world,
    lapSeconds: (racer?.lapTicks ?? []).map((t) => t * DT),
    finished: racer?.finishTick !== null && racer?.finishTick !== undefined,
    maxStep,
    ticks,
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
