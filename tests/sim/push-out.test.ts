// Push-outs (src/sim/car.ts) never move a car further in one tick than the bot-lap gate's teleport
// limit, however cars land on, wedge into and pile up against props and each other; a car that got
// into such a spot can always drive or back out; and the grid broadphase never changes a result.
import { describe, expect, it } from 'vitest';
import type { CarInput, PropKind, TrackData } from '../../src/sim/types.ts';
import type { CarState } from '../../src/sim/car.ts';
import { stepCars } from '../../src/sim/car.ts';
import { createRng, nextFloat, type Rng } from '../../src/sim/rng.ts';
import type { Track } from '../../src/sim/track.ts';
import { HAY_BALE_WIDTH, TREE_TRUNK_RADIUS, TYRE_STACK_RADIUS, buildTrack } from '../../src/sim/track.ts';
import {
  GAS,
  MAX_TICK_DISPLACEMENT,
  NO_INPUT,
  REVERSE,
  carCorners,
  exactJson,
  movingCar,
  polygonOverlap,
  propOverlap,
  stripTrack,
} from './helpers.ts';

const EAST = Math.PI / 2;
const KINDS: readonly PropKind[] = ['tyre-stack', 'cone-tree', 'hay-bale'];
/** Each prop's half-size across a gap or row (bales lie across with heading 0). */
const RADIUS: Record<PropKind, number> = { 'tyre-stack': TYRE_STACK_RADIUS, 'cone-tree': TREE_TRUNK_RADIUS, 'hay-bale': HAY_BALE_WIDTH / 2 };
/** Open dirt around the origin (a small loop 200 wide) with these props. */
const field = (props: TrackData['props']): Track =>
  buildTrack(stripTrack({ width: 200, props, centreline: [[0, 0], [100, 0], [100, 200], [-100, 200], [-100, 0]] }));

/** Steps the cars `ticks` times and returns the largest one-tick move of any of them. */
function worstStep(track: Track, cars: CarState[], inputs: readonly CarInput[], ticks: number): number {
  let worst = 0;
  for (let t = 0; t < ticks; t++) {
    const before = cars.map((c) => [c.x, c.z] as const);
    stepCars(cars, inputs, track);
    cars.forEach((c, i) => (worst = Math.max(worst, Math.hypot(c.x - before[i]![0], c.z - before[i]![1]))));
  }
  return worst;
}

/** Whether every car can get `away` units: within 60 ticks of reversing, or failing that of driving. */
function free(track: Track, cars: CarState[], away = 1): boolean {
  const done = cars.map(() => false);
  for (const input of [REVERSE, GAS]) {
    const from = cars.map((c) => [c.x, c.z] as const);
    for (let t = 0; t < 60 && !done.every(Boolean); t++) {
      stepCars(cars, cars.map(() => input), track);
      cars.forEach((c, i) => (done[i] ||= Math.hypot(c.x - from[i]![0], c.z - from[i]![1]) >= away));
    }
  }
  return done.every(Boolean);
}

/** True if any car overlaps another car or a prop (setups must start apart). */
function overlapping(track: Track, cars: readonly CarState[]): boolean {
  return cars.some(
    (c, i) =>
      cars.some((d, j) => j > i && polygonOverlap(carCorners(c.x, c.z, c.heading), carCorners(d.x, d.z, d.heading)) > 0) ||
      track.colliders.some((p) => propOverlap(c, p) > 0),
  );
}

/** 1–4 cars converging at 15–25 units/s (one in five reversing) on a cluster of random props. */
function pileUp(rng: Rng, cars: number): { track: Track; cars: CarState[]; inputs: CarInput[] } {
  const r = (): number => nextFloat(rng) * 8 - 4;
  const track = field(KINDS.concat('tyre-stack').map((kind) => ({ kind, x: r(), z: r() })));
  const list: CarState[] = [];
  const inputs: CarInput[] = [];
  for (let i = 0; i < cars; i++) {
    const a = nextFloat(rng) * Math.PI * 2;
    const d = 8 + nextFloat(rng) * 4;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const toCentre = Math.atan2(-x, z) + (nextFloat(rng) - 0.5) * 0.6;
    const reverse = nextFloat(rng) < 0.2;
    list.push(movingCar(track, x, z, reverse ? toCentre + Math.PI : toCentre, reverse ? -9 : 15 + nextFloat(rng) * 10));
    inputs.push(reverse ? REVERSE : { steer: (nextFloat(rng) - 0.5) * 2, throttle: true, brake: false });
  }
  return { track, cars: list, inputs };
}

describe('push-outs never look like a teleport, and never trap a car', () => {
  it('coming down onto a prop or onto another car at top speed', () => {
    for (const kind of ['car', ...KINDS] as const) {
      for (const lat of [-1.5, -1.25, -0.5, 0, 0.75, 1.5]) {
        const track = field(kind === 'car' ? [] : [{ kind, x: 0, z: lat }]);
        for (const y of [1.2, 1.6, 2.2, 2.8]) {
          const flyer = movingCar(track, -12, 0, EAST, 25);
          flyer.airborne = true;
          flyer.y = kind === 'car' ? y + 1.1 : y;
          const cars = kind === 'car' ? [flyer, movingCar(track, 0, lat, EAST)] : [flyer];
          const where = `${kind} from y ${y}, ${lat} off line`;
          expect(worstStep(track, cars, cars.map(() => NO_INPUT), 90), where).toBeLessThan(MAX_TICK_DISPLACEMENT);
          expect(free(track, cars), where).toBe(true);
        }
      }
    }
  });

  it('coming down across a row of tyre stacks 1.9 apart (narrower than a car), it can still back out or drive on', () => {
    const spacing = 1.9 + 2 * TYRE_STACK_RADIUS;
    const track = field(Array.from({ length: 9 }, (_, i) => ({ kind: 'tyre-stack' as const, x: 0, z: (i - 4) * spacing })));
    for (const y of [1.6, 2.2, 3]) {
      for (const speed of [12, 25]) {
        for (let dz = 0; dz < spacing; dz += spacing / 8) {
          const car = movingCar(track, -10, dz, EAST, speed);
          car.airborne = true;
          car.y = y;
          const where = `from y ${y} at ${speed}, ${dz.toFixed(2)} along the row`;
          expect(worstStep(track, [car], [GAS], 150), where).toBeLessThan(MAX_TICK_DISPLACEMENT);
          expect(free(track, [car]), where).toBe(true);
        }
      }
    }
  });

  it('steering into a gap between two props, or along a row of them', () => {
    for (const kind of KINDS) {
      for (let gap = 1.6; gap <= 3.4; gap += 0.15) {
        const half = gap / 2 + RADIUS[kind];
        const track = field([{ kind, x: 0, z: -half }, { kind, x: 0, z: half }]);
        for (const angle of [0, 0.1, 0.2, 0.4]) {
          for (const steer of [-1, -0.5, 0.5, 1]) {
            for (const speed of [25, 15]) {
              const car = movingCar(track, -8, 0, EAST + angle, speed);
              const where = `${kind} gap ${gap.toFixed(2)} angle ${angle} steer ${steer} speed ${speed}`;
              expect(worstStep(track, [car], [{ steer, throttle: true, brake: false }], 60), where).toBeLessThan(MAX_TICK_DISPLACEMENT);
              expect(free(track, [car]), where).toBe(true);
            }
          }
        }
      }
      for (const clearance of [0.1, 0.3, 0.6]) {
        const track = field(Array.from({ length: 20 }, (_, i) => ({ kind, x: -20 + i * (kind === 'hay-bale' ? 2.1 : 3.5), z: 3 + clearance + RADIUS[kind] })));
        for (const angle of [0.1, 0.5, 1.2]) {
          for (const steer of [-1, 1]) {
            const worst = worstStep(track, [movingCar(track, -9, 0, EAST + angle, 25)], [{ steer, throttle: true, brake: false }], 60);
            expect(worst, `${kind} row ${clearance} away, angle ${angle}, steer ${steer}`).toBeLessThan(MAX_TICK_DISPLACEMENT);
          }
        }
      }
    }
  });

  it('pile-ups of one to four cars in random prop clusters', () => {
    const rng = createRng(777);
    for (let cars = 1; cars <= 4; cars++) {
      for (let trial = 0; trial < 150; trial++) {
        const pile = pileUp(rng, cars);
        if (overlapping(pile.track, pile.cars)) continue;
        const where = `${cars} cars, trial ${trial}`;
        expect(worstStep(pile.track, pile.cars, pile.inputs, 120), where).toBeLessThan(MAX_TICK_DISPLACEMENT);
        // A random cluster (and the other cars) can box a car in so driving straight it gets only a
        // little way, but nothing ever freezes it in place.
        expect(free(pile.track, pile.cars, 0.05), where).toBe(true);
      }
    }
  });
});

describe('grid broadphase', () => {
  it('gives bit-identical results to checking every prop, in random cluttered pile-ups', () => {
    const rng = createRng(99);
    for (let trial = 0; trial < 200; trial++) {
      const cars = 1 + (trial % 4);
      const a = pileUp(createRng(trial), cars);
      // The same track with one grid cell holding every prop and every prop "reaching" everywhere.
      const all = a.track.colliders.map((_, i) => i);
      const scan: Track = {
        ...a.track,
        colliders: a.track.colliders.map((c) => ({ ...c, bound: 1e6 })),
        grid: { cell: Infinity, x0: 0, z0: 0, cols: 1, rows: 1, cells: [all], maxBound: 1e6 },
      };
      const b = pileUp(createRng(trial), cars);
      for (let t = 0; t < 150; t++) {
        const inputs = a.cars.map(() => ({ steer: (nextFloat(rng) - 0.5) * 2, throttle: nextFloat(rng) < 0.85, brake: nextFloat(rng) < 0.05 }));
        stepCars(a.cars, inputs, a.track);
        stepCars(b.cars, inputs, scan);
      }
      expect(exactJson(a.cars), `trial ${trial}`).toBe(exactJson(b.cars));
    }
  });
});
