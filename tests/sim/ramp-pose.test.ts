import { describe, expect, it } from 'vitest';
import type { CarInput, CarView } from '../../src/sim/types.ts';
import { CAR_LENGTH } from '../../src/sim/car.ts';
import { groundAt } from '../../src/sim/track.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/race.ts';
import { carViews, createWorld, stepWorld, type World } from '../../src/sim/world.ts';
import { dustBowl, GAS } from './helpers.ts';

const HALF = CAR_LENGTH / 2;
const SAMPLES = 41;

/** Deepest point (positive = below ground) of the body's base line, sampled nose to tail. */
function clipDepth(world: World, v: CarView): number {
  const fx = Math.sin(v.heading);
  const fz = -Math.cos(v.heading);
  let worst = -Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const t = -1 + (2 * i) / (SAMPLES - 1);
    const along = t * HALF * Math.cos(v.pitch);
    const body = v.y + t * HALF * Math.sin(v.pitch);
    worst = Math.max(worst, groundAt(world.track, v.x + fx * along, v.z + fz * along).h - body);
  }
  return worst;
}

/** Drives car 0 with `input(tick, views so far)`; returns the worst clip depth and the views seen. */
function drive(input: (tick: number, views: readonly CarView[]) => CarInput, ticks: number): { worst: number; views: CarView[] } {
  const world = createWorld(dustBowl, { seed: 1, carCount: 1 });
  for (let i = 0; i < COUNTDOWN_TICKS; i++) stepWorld(world, []);
  let worst = -Infinity;
  const views: CarView[] = [];
  for (let i = 0; i < ticks; i++) {
    stepWorld(world, [input(i, views)]);
    const v = carViews(world)[0] as CarView;
    worst = Math.max(worst, clipDepth(world, v));
    views.push(v);
  }
  return { worst, views };
}

describe('car pose over the ramp', () => {
  const slope = Math.atan2(1.0, 5); // Dust Bowl ramp: 1.0 high, 5 long

  it('never clips into the ramp or ground at full speed, and tilts with the slope', () => {
    const { worst, views } = drive(() => GAS, 420);
    expect(worst).toBeLessThan(1e-6);
    expect(views.some((v) => v.airborne)).toBe(true);
    expect(Math.max(...views.map((v) => v.pitch))).toBeCloseTo(slope, 2);
    expect(views[0]?.pitch).toBe(0);
  });

  it('never clips when crawling up the ramp and rolling off the lip', () => {
    // Pulse the throttle to stay slow: the car tips over the lip instead of launching.
    const { worst, views } = drive((t) => ({ steer: 0, throttle: t % 4 === 0, brake: false }), 1500);
    expect(worst).toBeLessThan(1e-6);
    expect(Math.max(...views.map((v) => v.y))).toBeGreaterThan(0.5);
  });

  it('never clips when reversing back down the slope', () => {
    // Crawl until halfway up the slope, then hold brake: the car stops and reverses down.
    let reversing = false;
    const { worst, views } = drive((t, seen) => {
      reversing ||= (seen.at(-1)?.y ?? 0) > 0.5;
      return reversing ? { steer: 0, throttle: false, brake: true } : { steer: 0, throttle: t % 4 === 0, brake: false };
    }, 1500);
    expect(reversing).toBe(true);
    expect(views.some((v) => v.speed < -2 && v.y > 0.1)).toBe(true);
    expect(worst).toBeLessThan(1e-6);
  });
});
