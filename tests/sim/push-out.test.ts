// Push-outs (src/sim/car.ts) never move a car further in one tick than the bot-lap gate's teleport
// limit, however cars land on, wedge into and pile up against props and each other; and the grid
// broadphase never changes a result.
import { describe, expect, it } from 'vitest';
import type { CarInput, PropKind, TrackData } from '../../src/sim/types.ts';
import type { CarState } from '../../src/sim/car.ts';
import { stepCars } from '../../src/sim/car.ts';
import { createRng, nextFloat, type Rng } from '../../src/sim/rng.ts';
import type { Track } from '../../src/sim/track.ts';
import { buildTrack } from '../../src/sim/track.ts';
import {
  MAX_TICK_DISPLACEMENT,
  NO_INPUT,
  REVERSE,
  boxCorners,
  carCorners,
  circleOverlap,
  exactJson,
  movingCar,
  polygonOverlap,
  stripTrack,
} from './helpers.ts';

const EAST = Math.PI / 2;
const KINDS: readonly PropKind[] = ['tyre-stack', 'cone-tree', 'hay-bale'];
const RADIUS: Record<PropKind, number> = { 'tyre-stack': 0.8, 'cone-tree': 0.5, 'hay-bale': 0.6 };
const field = (props: TrackData['props']): Track => buildTrack(stripTrack({ width: 200, props }));

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

/** True if the car overlaps another car or a prop (setups must start apart). */
function overlapping(track: Track, cars: readonly CarState[]): boolean {
  return cars.some((c, i) => {
    const box = carCorners(c.x, c.z, c.heading);
    return (
      cars.some((d, j) => j > i && polygonOverlap(box, carCorners(d.x, d.z, d.heading)) > 0) ||
      track.colliders.some((p) =>
        p.shape === 'circle'
          ? circleOverlap(c.x, c.z, c.heading, p.x, p.z, p.r) > 0
          : polygonOverlap(box, boxCorners(p.x, p.z, p.heading, p.halfLength, p.halfWidth)) > 0,
      )
    );
  });
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

describe('push-outs never look like a teleport', () => {
  it('coming down onto a prop or onto another car at top speed', () => {
    for (const kind of ['car', ...KINDS] as const) {
      for (const y of [1.2, 1.6, 2.2, 2.8]) {
        for (const lat of [-1.5, -1.25, -0.5, 0, 0.75, 1.5]) {
          const track = field(kind === 'car' ? [] : [{ kind, x: 0, z: lat }]);
          const flyer = movingCar(track, -12, 0, EAST, 25);
          flyer.airborne = true;
          flyer.y = kind === 'car' ? y + 1.1 : y;
          const cars = kind === 'car' ? [flyer, movingCar(track, 0, lat, EAST)] : [flyer];
          const worst = worstStep(track, cars, cars.map(() => NO_INPUT), 90);
          expect(worst, `${kind} from y ${y}, ${lat} off line`).toBeLessThan(MAX_TICK_DISPLACEMENT);
        }
      }
    }
  });

  it('steering into a gap between two props, or along a row of them', () => {
    for (const kind of KINDS) {
      for (let gap = 1.6; gap <= 3.4; gap += 0.15) {
        for (const angle of [0, 0.1, 0.2, 0.4]) {
          for (const steer of [-1, -0.5, 0.5, 1]) {
            for (const speed of [25, 15]) {
              const half = gap / 2 + RADIUS[kind];
              const track = field([{ kind, x: 0, z: -half }, { kind, x: 0, z: half }]);
              const worst = worstStep(track, [movingCar(track, -8, 0, EAST + angle, speed)], [{ steer, throttle: true, brake: false }], 60);
              expect(worst, `${kind} gap ${gap.toFixed(2)} angle ${angle} steer ${steer} speed ${speed}`).toBeLessThan(MAX_TICK_DISPLACEMENT);
            }
          }
        }
      }
      for (const clearance of [0.1, 0.3, 0.6]) {
        for (const angle of [0.1, 0.5, 1.2]) {
          for (const steer of [-1, 1]) {
            const row = Array.from({ length: 20 }, (_, i) => ({ kind, x: -20 + i * (kind === 'hay-bale' ? 2.1 : 3.5), z: 3 + clearance + RADIUS[kind] }));
            const track = field(row);
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
        expect(worstStep(pile.track, pile.cars, pile.inputs, 120), `${cars} cars, trial ${trial}`).toBeLessThan(MAX_TICK_DISPLACEMENT);
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
