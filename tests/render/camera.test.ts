import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CAMERA, cameraAngles, cameraDistance, createCameraRig, createRaceScene, playerLivery } from '../../src/render/index.ts';
import { at, carView, layout } from './helpers.ts';

/** World units across the frame at the target, measured by unprojecting the screen edges. */
function frameWidthAtTarget(width: number, height: number): number {
  const rig = createCameraRig(width, height);
  rig.snap(0, 0);
  const cam = rig.camera;
  const dist = cam.position.length();
  const hit = (ndcX: number): Vector3 => {
    const dir = new Vector3(ndcX, 0, 0.5).unproject(cam).sub(cam.position).normalize();
    // Point on the ray at the target's distance along the view axis.
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return cam.position.clone().add(dir.multiplyScalar(dist / dir.dot(forward)));
  };
  return hit(1).distanceTo(hit(-1));
}

describe('camera rig (UI_RULES §9)', () => {
  it('spec constants are within §9', () => {
    expect(CAMERA.pitchDeg).toBeGreaterThanOrEqual(55);
    expect(CAMERA.pitchDeg).toBeLessThanOrEqual(60);
    expect(CAMERA.yawDeg).toBe(0);
    expect(CAMERA.rollDeg).toBe(0);
    expect(CAMERA.vfovDeg).toBeCloseTo(19);
    expect(CAMERA.frameWidth).toEqual({ mobile: 56, desktop: 55 });
  });

  it('frames 56 units across on a phone and 55 on desktop, from ≈77 units back on a phone', () => {
    expect(frameWidthAtTarget(844, 390)).toBeCloseTo(56, 1);
    expect(frameWidthAtTarget(1440, 900)).toBeCloseTo(55, 1);
    expect(cameraDistance(844 / 390)).toBeGreaterThan(75);
    expect(cameraDistance(844 / 390)).toBeLessThan(80);
  });

  it('live camera keeps pitch 57 and zero yaw/roll while following a car around the track', () => {
    const race = createRaceScene(layout, [playerLivery(1)]);
    for (let i = 0; i <= 240; i++) {
      const s = at(i / 240);
      race.update([carView({ x: s.x, z: s.z, heading: s.heading, speed: 25 })], 1 / 60);
      const a = cameraAngles(race.camera);
      expect(a.pitchDeg).toBeCloseTo(CAMERA.pitchDeg, 6);
      expect(a.yawDeg).toBeCloseTo(0, 9);
      expect(a.rollDeg).toBeCloseTo(0, 9);
    }
    race.resize(1440, 900);
    expect(cameraAngles(race.camera)).toEqual({ pitchDeg: expect.closeTo(57, 6), yawDeg: 0, rollDeg: 0 });
  });

  it('follows by translation, aiming ahead along the direction of travel', () => {
    const rig = createCameraRig(844, 390);
    rig.snap(0, 0);
    for (let i = 0; i < 120; i++) rig.follow(10, 0, 20, 0, 1 / 60);
    const t = rig.target();
    expect(t.x).toBeGreaterThan(10); // ahead of the car (moving east)
    expect(t.x).toBeLessThanOrEqual(10 + CAMERA.lookAheadMax + 1e-9);
    expect(t.z).toBeCloseTo(0);
  });

  it('smoothing is frame-rate independent', () => {
    const run = (steps: number): number => {
      const rig = createCameraRig(844, 390);
      rig.snap(0, 0);
      for (let i = 0; i < steps; i++) rig.follow(10, 0, 0, 0, 0.5 / steps);
      return rig.target().x;
    };
    expect(run(30)).toBeCloseTo(run(144), 6);
  });
});
