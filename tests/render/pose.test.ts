import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildCar, createMaterials, playerLivery } from '../../src/render/index.ts';
import { poseCar } from '../../src/render/car.ts';
import { carView } from './helpers.ts';

describe('car pose', () => {
  it('pitches the body nose-up and keeps the roof roundel in the roof plane', () => {
    const car = buildCar(playerLivery(1), createMaterials());
    for (const heading of [0, 1.1, Math.PI, -2.4]) {
      poseCar(car, carView({ heading, pitch: 0.2 }));
      const nose = new Vector3(0, 0, -1).applyEuler(car.body.rotation);
      expect(nose.y).toBeCloseTo(Math.sin(0.2), 6);
      const bodyUp = new Vector3(0, 1, 0).applyEuler(car.body.rotation);
      const roundelUp = new Vector3(0, 1, 0).applyQuaternion(car.roundel.quaternion);
      expect(roundelUp.distanceTo(bodyUp)).toBeLessThan(1e-9);
    }
  });

  it('keeps the roundel flat and level on flat ground', () => {
    const car = buildCar(playerLivery(1), createMaterials());
    poseCar(car, carView({ heading: 0.7, pitch: 0 }));
    expect(new Vector3(0, 1, 0).applyQuaternion(car.roundel.quaternion).y).toBeCloseTo(1, 12);
  });
});
