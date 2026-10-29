import { describe, expect, it } from 'vitest';
import type { CarInput, PropKind, TrackData } from '../../src/sim/types.ts';
import type { CarState } from '../../src/sim/car.ts';
import { CAR_LENGTH, CAR_TUNING, DT, SURFACES, carView, forwardSpeed } from '../../src/sim/car.ts';
import type { Track } from '../../src/sim/track.ts';
import { PROP_COLLIDER_TOP, buildTrack, validateTrack } from '../../src/sim/track.ts';
import { GAS, NO_INPUT, REVERSE, circleOverlap, movingCar, propOverlap, stepCar, stripTrack } from './helpers.ts';

const EAST = Math.PI / 2;

function build(data: TrackData): Track {
  return buildTrack(validateTrack(data));
}

function run(car: CarState, track: Track, ticks: number, input: CarInput | ((c: CarState) => CarInput)): void {
  for (let i = 0; i < ticks; i++) stepCar(car, typeof input === 'function' ? input(car) : input, track);
}

const DIRT_TOP = SURFACES.dirt.topSpeed;

describe('acceleration and speed', () => {
  const track = build(stripTrack());

  it('top speed on dirt is in the arcade target range', () => {
    expect(DIRT_TOP).toBeGreaterThanOrEqual(24);
    expect(DIRT_TOP).toBeLessThanOrEqual(28);
  });

  it('accelerates punchily to top speed on dirt', () => {
    const car = movingCar(track, -250, 0, EAST);
    let ticksTo20 = -1;
    for (let i = 0; i < 5 * 60; i++) {
      stepCar(car, GAS, track);
      if (ticksTo20 < 0 && forwardSpeed(car) >= 20) ticksTo20 = i + 1;
    }
    expect(ticksTo20).toBeGreaterThan(0);
    expect(ticksTo20 * DT).toBeLessThan(1.5);
    expect(forwardSpeed(car)).toBeGreaterThan(DIRT_TOP * 0.99);
    expect(forwardSpeed(car)).toBeLessThanOrEqual(DIRT_TOP);
    expect(car.surface).toBe('dirt');
    expect(car.x).toBeGreaterThan(-250 + 90);
  });

  it('coasts down without throttle', () => {
    const car = movingCar(track, -250, 0, EAST, 20);
    run(car, track, 60, NO_INPUT);
    expect(forwardSpeed(car)).toBeLessThan(18);
    expect(forwardSpeed(car)).toBeGreaterThan(10);
  });

  it('brakes to a stop, then reverses when brake is held', () => {
    const car = movingCar(track, -250, 0, EAST, 20);
    let stopTick = -1;
    for (let i = 0; i < 4 * 60; i++) {
      stepCar(car, REVERSE, track);
      if (stopTick < 0 && forwardSpeed(car) <= 0.5) stopTick = i + 1;
    }
    expect(stopTick).toBeGreaterThan(0);
    expect(stopTick * DT).toBeLessThan(0.6);
    expect(forwardSpeed(car)).toBeLessThan(-8);
    expect(carView(car, track).speed).toBeLessThan(-8);
    expect(car.heading).toBeCloseTo(EAST, 12);
    // Throttle while reversing brakes first, then drives forward again.
    run(car, track, 2 * 60, GAS);
    expect(forwardSpeed(car)).toBeGreaterThan(10);
  });

  it('cannot turn at a standstill; steering authority grows with speed', () => {
    const still = movingCar(track, -250, 0, EAST);
    run(still, track, 30, { steer: 1, throttle: false, brake: false });
    expect(still.heading).toBe(EAST);

    const turnIn = (speed: number): number => {
      const c = movingCar(track, -250, 0, EAST, speed);
      stepCar(c, { steer: 1, throttle: false, brake: false }, track);
      return c.heading - EAST;
    };
    expect(turnIn(2)).toBeGreaterThan(0); // steer +1 turns right (heading increases)
    expect(turnIn(2)).toBeLessThan(turnIn(6));
    expect(turnIn(DIRT_TOP)).toBeLessThan(turnIn(8));
  });
});

describe('grip and drift', () => {
  // A very wide strip so the car stays on dirt however far it slides.
  const track = build(stripTrack({ width: 200 }));

  it('grips without sliding when turning at low speed', () => {
    const car = movingCar(track, -250, 0, EAST, 6);
    let maxSlip = 0;
    run(car, track, 90, (c) => {
      maxSlip = Math.max(maxSlip, c.slip);
      return { steer: 1, throttle: false, brake: false };
    });
    expect(maxSlip).toBeLessThan(0.2);
  });

  it('hard steering at speed breaks traction into a slide that can be caught', () => {
    const car = movingCar(track, -250, 0, EAST, DIRT_TOP);
    let maxSlip = 0;
    let slid = false;
    run(car, track, 45, (c) => {
      maxSlip = Math.max(maxSlip, c.slip);
      slid ||= c.sliding;
      return { steer: 1, throttle: true, brake: false };
    });
    expect(slid).toBe(true);
    expect(maxSlip).toBeGreaterThan(0.6);
    expect(maxSlip).toBeLessThanOrEqual(1);
    // Straighten up: the slide is caught and grip returns. The car is still moving.
    run(car, track, 90, GAS);
    expect(car.slip).toBeLessThan(0.05);
    expect(car.sliding).toBe(false);
    expect(Math.abs(forwardSpeed(car))).toBeGreaterThan(8);
  });

  it('a held slide does not spin the car round endlessly', () => {
    const car = movingCar(track, -250, 0, EAST, DIRT_TOP);
    let maxAngle = 0;
    run(car, track, 120, (c) => {
      const fx = Math.sin(c.heading);
      const fz = -Math.cos(c.heading);
      const vf = c.vx * fx + c.vz * fz;
      const vl = c.vx * -fz + c.vz * fx;
      if (Math.hypot(c.vx, c.vz) > 5) maxAngle = Math.max(maxAngle, Math.abs(Math.atan2(vl, vf)));
      return { steer: 1, throttle: true, brake: false };
    });
    expect(maxAngle).toBeLessThan(Math.PI / 2);
  });
});

describe('surfaces', () => {
  const track = build(stripTrack());

  it('grass has a lower top speed than dirt', () => {
    const dirt = movingCar(track, -250, 0, EAST);
    const grass = movingCar(track, -250, 30, EAST);
    expect(grass.surface).toBe('grass');
    run(dirt, track, 5 * 60, GAS);
    run(grass, track, 5 * 60, GAS);
    expect(grass.surface).toBe('grass');
    expect(forwardSpeed(grass)).toBeLessThan(forwardSpeed(dirt) * 0.7);
    expect(forwardSpeed(grass)).toBeCloseTo(SURFACES.grass.topSpeed, 0);
  });

  it('running onto grass at speed slows the car', () => {
    const car = movingCar(track, -250, 30, EAST, DIRT_TOP);
    run(car, track, 60, GAS);
    expect(forwardSpeed(car)).toBeLessThan(SURFACES.grass.topSpeed + 2);
  });

  it('grass has more drag and less grip', () => {
    expect(SURFACES.grass.coastDecel).toBeGreaterThan(SURFACES.dirt.coastDecel);
    expect(SURFACES.grass.grip).toBeLessThan(SURFACES.dirt.grip);
    const dirt = movingCar(track, -250, 0, EAST, 14);
    const grass = movingCar(track, -250, 30, EAST, 14);
    run(dirt, track, 30, NO_INPUT);
    run(grass, track, 30, NO_INPUT);
    expect(forwardSpeed(grass)).toBeLessThan(forwardSpeed(dirt) - 1);
  });
});

describe('ramp jump', () => {
  // Lip at s = 0, i.e. (0, 0), facing east; the slope rises over x ∈ [−6, 0].
  const track = build(stripTrack({ ramps: [{ at: 0, length: 6, height: 1.2 }] }));

  it('follows the slope, launches off the lip, flies ballistically and lands', () => {
    const car = movingCar(track, -30, 0, EAST, DIRT_TOP);
    let maxY = 0;
    let firstAir = -1;
    let landedAt: number | null = null;
    let headingInAir: number | null = null;
    let speedInAir: number | null = null;
    let sawSlope = false;
    for (let i = 0; i < 180; i++) {
      const wasAir = car.airborne;
      // Full steer while airborne must do nothing.
      stepCar(car, { steer: wasAir ? 1 : 0, throttle: true, brake: false }, track);
      if (!car.airborne && car.y > 0.1 && car.y < 1.2) sawSlope = true;
      if (car.airborne && firstAir < 0) {
        firstAir = i;
        headingInAir = car.heading;
        speedInAir = Math.hypot(car.vx, car.vz);
      }
      if (car.airborne) {
        expect(car.heading).toBe(headingInAir);
        expect(Math.hypot(car.vx, car.vz)).toBe(speedInAir);
      }
      if (wasAir && !car.airborne && landedAt === null) landedAt = car.x;
      maxY = Math.max(maxY, car.y);
    }
    expect(sawSlope).toBe(true);
    expect(firstAir).toBeGreaterThan(0);
    expect(maxY).toBeGreaterThan(1.2);
    expect(landedAt).not.toBeNull();
    expect(landedAt!).toBeGreaterThan(8);
    expect(car.airborne).toBe(false);
    expect(car.y).toBe(0);
    expect(forwardSpeed(car)).toBeGreaterThan(20);
  });

  it('rolling slowly off the lip just drops down', () => {
    const car = movingCar(track, -1, 0, EAST, 4);
    let maxY = 0;
    let airTicks = 0;
    run(car, track, 240, (c) => {
      maxY = Math.max(maxY, c.y);
      if (c.airborne) airTicks++;
      return NO_INPUT;
    });
    expect(maxY).toBeLessThan(1.25);
    expect(airTicks).toBeGreaterThan(0);
    expect(car.airborne).toBe(false);
    expect(car.y).toBe(0);
  });
});

describe('prop collisions', () => {
  const tyreAt = (x: number, z: number): TrackData => stripTrack({ props: [{ kind: 'tyre-stack', x, z }] });

  it('pushes an overlapping car out a little at a time, never in a jump', () => {
    const track = build(tyreAt(0, 0));
    // Car front at x = −2.0 + 2.1 = 0.1 reaches 0.9 into the stack (front face vs stack edge at −0.8).
    const car = movingCar(track, -2.0, 0, EAST);
    expect(circleOverlap(car.x, car.z, car.heading, 0, 0, 0.8)).toBeGreaterThan(0.5);
    for (let i = 0; i < 5; i++) {
      const x = car.x;
      stepCar(car, NO_INPUT, track);
      expect(x - car.x).toBeLessThanOrEqual(CAR_TUNING.maxPush + 1e-12);
    }
    expect(circleOverlap(car.x, car.z, car.heading, 0, 0, 0.8)).toBeLessThan(1e-9);
    expect(car.x).toBeLessThan(-2.0);
    expect(car.x).toBeGreaterThan(-3.0);
  });

  it('a head-on hit stops the car at the prop and bleeds speed', () => {
    const track = build(tyreAt(0, 0));
    const car = movingCar(track, -30, 0, EAST, DIRT_TOP);
    let hitSpeed = 0;
    let after = Infinity;
    let hit = false;
    run(car, track, 120, (c) => {
      const s = Math.hypot(c.vx, c.vz);
      if (!hit && c.x > -0.8 - CAR_LENGTH / 2 - 0.5) {
        hit = true;
        hitSpeed = s;
      } else if (hit) {
        after = Math.min(after, s);
      }
      return GAS;
    });
    expect(hit).toBe(true);
    expect(hitSpeed).toBeGreaterThan(20);
    expect(after).toBeLessThan(hitSpeed * 0.5);
    expect(car.x + CAR_LENGTH / 2).toBeLessThanOrEqual(-0.8 + 1e-9);
  });

  it('a glancing hit deflects the car and keeps most of its speed', () => {
    const track = build(tyreAt(0, 0));
    const car = movingCar(track, -30, -1.6, EAST, DIRT_TOP);
    run(car, track, 120, GAS);
    expect(car.x).toBeGreaterThan(10);
    expect(car.z).toBeLessThan(-1.6);
    expect(forwardSpeed(car)).toBeGreaterThan(15);
  });

  it('never passes through any prop kind, even far above top speed', () => {
    const kinds: PropKind[] = ['tyre-stack', 'cone-tree', 'hay-bale'];
    for (const kind of kinds) {
      for (const speed of [DIRT_TOP, DIRT_TOP * 2.5]) {
        for (const lateral of [0, 0.6, -0.6, 1.5, -1.5]) {
          // Bales: one across the track (point prop, heading 0) and one along it (row).
          const variants: TrackData[] =
            kind === 'hay-bale'
              ? [
                  stripTrack({ props: [{ kind, x: 0, z: 0 }] }),
                  stripTrack({
                    propRows: [{ kind, side: 'right', from: 0, to: 0.0001, spacing: 1, offset: -4.2 }],
                  }),
                ]
              : [stripTrack({ props: [{ kind, x: 0, z: 0 }] })];
          for (const data of variants) {
            const track = build(data);
            const c = track.colliders[0]!;
            const car = movingCar(track, -20, lateral, EAST, speed);
            for (let i = 0; i < 90; i++) {
              stepCar(car, GAS, track);
              expect(propOverlap(car, c), `${kind} speed ${speed} lateral ${lateral} tick ${i}`).toBeLessThan(1e-6);
              if (lateral === 0) expect(car.x).toBeLessThan(c.x);
            }
          }
        }
      }
    }
  });

  it('flies over props when high enough', () => {
    const track = build(tyreAt(0, 0));
    const high = movingCar(track, -10, 0, EAST, 20);
    high.airborne = true;
    high.y = 3;
    high.vy = 12;
    run(high, track, 40, NO_INPUT);
    expect(high.x).toBeGreaterThan(2);
  });

  it('coming down onto a prop, lands on its top, can drive, and drops off the far side', () => {
    const track = build(stripTrack({ props: [{ kind: 'hay-bale', x: 0, z: 0 }] }));
    const car = movingCar(track, -2, 0, EAST, 3);
    car.airborne = true;
    car.y = 1.5;
    let rested = 0;
    run(car, track, 120, (c) => {
      if (c.y === PROP_COLLIDER_TOP && !c.airborne) rested++;
      return GAS;
    });
    expect(rested).toBeGreaterThan(5);
    expect(car.y).toBe(0);
    expect(car.x).toBeGreaterThan(CAR_LENGTH);
  });
});
