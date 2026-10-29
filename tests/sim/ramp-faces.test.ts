// A ramp's lip and sides are walls to a grounded car: driving or reversing into them must not lift
// the car onto the ramp in one tick. Only the slope, from the foot, is a way up.
import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/types.ts';
import type { CarState } from '../../src/sim/car.ts';
import { CAR_TUNING, stepCar } from '../../src/sim/car.ts';
import { buildTrack, validateTrack } from '../../src/sim/track.ts';
import { GAS, REVERSE, movingCar, stripTrack } from './helpers.ts';

// Lip at (0, 0) facing east; the slope rises over x ∈ [−6, 0], z ∈ [−4.2, 4.2].
const track = buildTrack(validateTrack(stripTrack({ ramps: [{ at: 0, length: 6, height: 1.2 }] })));

/** Runs a car into the ramp (moving along `heading`, or backwards when reversing) and returns its
 * largest one-tick rise and its final state. */
function hit(x: number, z: number, heading: number, input: CarInput, speed: number): { rise: number; car: CarState } {
  const car = movingCar(track, x, z, heading, input.brake ? -speed : speed);
  let rise = 0;
  for (let i = 0; i < 120; i++) {
    const y = car.y;
    stepCar(car, input, track);
    rise = Math.max(rise, car.y - y);
  }
  return { rise, car };
}

describe('ramp faces', () => {
  const faces: [string, number, number, number, CarInput, number, (car: CarState) => boolean][] = [
    ['reversing into the lip from beyond it stops at the face', 4, 0, Math.PI / 2, REVERSE, 8, (c) => c.x > 0],
    ['driving the wrong way into the lip stops at the face', 10, 0, -Math.PI / 2, GAS, 20, (c) => c.x > 0],
    ['driving north into the south side stops at the side', -1.5, 8, 0, GAS, 15, (c) => c.z > 4.2],
    ['driving south into the north side stops at the side', -1.5, -8, Math.PI, GAS, 15, (c) => c.z < -4.2],
    // North-east into the south side, where the slope is already 0.56 high.
    ['a glancing hit on the side slides along it instead of stopping dead', -6, 7, Math.PI / 4, GAS, 15, (c) => c.x > 5],
  ];
  for (const [name, x, z, heading, input, speed, where] of faces) {
    it(`${name}, without climbing onto the ramp`, () => {
      const { rise, car } = hit(x, z, heading, input, speed);
      expect(rise).toBeLessThanOrEqual(CAR_TUNING.maxStepUp);
      expect(car.y).toBe(0);
      expect(where(car)).toBe(true);
    });
  }

  it('still drives up the slope from the foot and launches off the lip', () => {
    const { car, rise } = hit(-20, 0, Math.PI / 2, GAS, 25);
    expect(rise).toBeGreaterThan(0);
    expect(car.x).toBeGreaterThan(20);
  });
});
