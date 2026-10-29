// A ramp's lip and sides are walls to a grounded car: driving or reversing into them must not lift
// the car onto the ramp in one tick. Only the slope, from the foot, is a way up.
import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/types.ts';
import { CAR_TUNING, createCar, stepCar } from '../../src/sim/car.ts';
import { buildTrack, validateTrack } from '../../src/sim/track.ts';
import { stripTrack } from './helpers.ts';

// Lip at (0, 0) facing east; the slope rises over x ∈ [−6, 0], z ∈ [−4.2, 4.2].
const track = buildTrack(validateTrack(stripTrack({ ramps: [{ at: 0, length: 6, height: 1.2 }] })));
const REVERSE: CarInput = { steer: 0, throttle: false, brake: true };
const GAS: CarInput = { steer: 0, throttle: true, brake: false };

/** Runs a car into the ramp and returns its largest one-tick rise and its final state. */
function hit(x: number, z: number, heading: number, input: CarInput, speed: number) {
  const car = createCar(track, x, z, heading);
  // Already moving along `heading` (or backwards when reversing).
  const v = input.brake ? -speed : speed;
  car.vx = Math.sin(heading) * v;
  car.vz = -Math.cos(heading) * v;
  let rise = 0;
  for (let i = 0; i < 120; i++) {
    const y = car.y;
    stepCar(car, input, track);
    rise = Math.max(rise, car.y - y);
  }
  return { rise, car };
}

describe('ramp faces', () => {
  it('reversing into the lip from beyond it does not pop the car up', () => {
    const { rise, car } = hit(4, 0, Math.PI / 2, REVERSE, 8);
    expect(rise).toBeLessThanOrEqual(CAR_TUNING.maxStepUp);
    expect(car.y).toBe(0);
    expect(car.x).toBeGreaterThan(0); // stopped at the lip face
  });

  it('driving the wrong way into the lip stops at the face', () => {
    const { rise, car } = hit(10, 0, -Math.PI / 2, GAS, 20);
    expect(rise).toBeLessThanOrEqual(CAR_TUNING.maxStepUp);
    expect(car.y).toBe(0);
    expect(car.x).toBeGreaterThan(0);
  });

  it('driving into a side of the ramp stops at the side and does not climb it', () => {
    for (const z of [8, -8]) {
      const heading = z > 0 ? 0 : Math.PI; // north from the south side, south from the north side
      const { rise, car } = hit(-1.5, z, heading, GAS, 15);
      expect(rise).toBeLessThanOrEqual(CAR_TUNING.maxStepUp);
      expect(car.y).toBe(0);
      expect(Math.abs(car.z)).toBeGreaterThan(4.2);
    }
  });

  it('a glancing hit on the side slides along it instead of stopping dead', () => {
    // North-east into the south side, where the slope is already 0.56 high.
    const { rise, car } = hit(-6, 7, Math.PI / 4, GAS, 15);
    expect(rise).toBeLessThanOrEqual(CAR_TUNING.maxStepUp);
    expect(car.y).toBe(0);
    expect(car.x).toBeGreaterThan(5);
  });

  it('still drives up the slope from the foot and launches off the lip', () => {
    const { car, rise } = hit(-20, 0, Math.PI / 2, GAS, 25);
    expect(rise).toBeGreaterThan(0);
    expect(car.x).toBeGreaterThan(20);
  });
});
