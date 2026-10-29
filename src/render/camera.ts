// Camera rig (UI_RULES §9): one fixed-angle perspective camera looking north and down at 57°,
// narrow 19° vertical FOV, far back. It never yaws, rolls, orbits or shakes. It follows the player
// by translation only, smoothed, aiming a little ahead along the car's velocity.
import { PerspectiveCamera, Quaternion, Vector3, type Camera } from 'three';

/** The camera spec. Gates check these values; change them only with UI_RULES §9. */
export const CAMERA = {
  /** Look-down angle from horizontal, degrees (allowed 55–60). */
  pitchDeg: 57,
  /** Always 0: north is screen-up. */
  yawDeg: 0,
  /** Always 0. */
  rollDeg: 0,
  /** Vertical field of view, degrees. */
  vfovDeg: 19,
  /** World units across the screen at the target: mobile-like aspect vs desktop. */
  frameWidth: { mobile: 56, desktop: 55 },
  /** Aspect ratios (w/h) at or above this count as mobile landscape (844×390 is 2.16, desktops ≤ 1.78). */
  mobileMinAspect: 1.9,
  /** Look-ahead: seconds of velocity added to the target, capped in units. */
  lookAheadSeconds: 0.3,
  lookAheadMax: 6,
  /** Follow smoothing half-life in seconds (exponential, frame-rate independent). */
  followHalfLife: 0.12,
} as const;

const DEG = Math.PI / 180;

/** Frame width in world units for a viewport aspect ratio. */
export function frameWidthFor(aspect: number): number {
  return aspect >= CAMERA.mobileMinAspect ? CAMERA.frameWidth.mobile : CAMERA.frameWidth.desktop;
}

/** Camera-to-target distance so the frame is frameWidthFor(aspect) units across at the target. */
export function cameraDistance(aspect: number): number {
  const halfH = Math.tan((CAMERA.vfovDeg * DEG) / 2) * aspect; // tan of the half horizontal FOV
  return frameWidthFor(aspect) / 2 / halfH;
}

/** Live pitch/yaw/roll in degrees, measured from the camera's world orientation. */
export function cameraAngles(camera: Camera): { pitchDeg: number; yawDeg: number; rollDeg: number } {
  camera.updateMatrixWorld(true);
  const q = camera.getWorldQuaternion(new Quaternion());
  const forward = new Vector3(0, 0, -1).applyQuaternion(q);
  const right = new Vector3(1, 0, 0).applyQuaternion(q);
  const clean = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pitchDeg: clean(Math.asin(-forward.y) / DEG),
    yawDeg: clean(Math.atan2(forward.x, -forward.z) / DEG),
    rollDeg: clean(Math.asin(right.y) / DEG),
  };
}

/** The follow camera. `follow` once per rendered frame; `snap` to jump without smoothing. */
export interface CameraRig {
  readonly camera: PerspectiveCamera;
  /** Viewport size in CSS pixels; recomputes aspect and distance. */
  resize(width: number, height: number): void;
  /** Eases the target toward (x, z) + look-ahead along (vx, vz) units/s. */
  follow(x: number, z: number, vx: number, vz: number, dtSeconds: number): void;
  /** Puts the target exactly at (x, z) + look-ahead. */
  snap(x: number, z: number, vx?: number, vz?: number): void;
  /** Current ground target (x, z). */
  target(): { x: number; z: number };
}

export function createCameraRig(width = 844, height = 390): CameraRig {
  const camera = new PerspectiveCamera(CAMERA.vfovDeg, width / height, 1, 400);
  camera.name = 'race-camera';
  camera.rotation.set(-CAMERA.pitchDeg * DEG, 0, 0, 'YXZ'); // fixed for life: never touched again
  let distance = cameraDistance(width / height);
  const tgt = { x: 0, z: 0 };

  const place = (): void => {
    const p = CAMERA.pitchDeg * DEG;
    camera.position.set(tgt.x, Math.sin(p) * distance, tgt.z + Math.cos(p) * distance);
    camera.updateMatrixWorld();
  };
  const ahead = (v: number): number => v * CAMERA.lookAheadSeconds;
  const clampAhead = (ax: number, az: number): [number, number] => {
    const len = Math.hypot(ax, az);
    const k = len > CAMERA.lookAheadMax ? CAMERA.lookAheadMax / len : 1;
    return [ax * k, az * k];
  };

  const rig: CameraRig = {
    camera,
    resize(w, h) {
      const aspect = Math.max(1, w) / Math.max(1, h);
      camera.aspect = aspect;
      distance = cameraDistance(aspect);
      camera.near = distance * 0.5;
      camera.far = distance * 1.8;
      camera.updateProjectionMatrix();
      place();
    },
    follow(x, z, vx, vz, dt) {
      const [ax, az] = clampAhead(ahead(vx), ahead(vz));
      const k = dt > 0 ? 1 - Math.pow(0.5, dt / CAMERA.followHalfLife) : 0;
      tgt.x += (x + ax - tgt.x) * k;
      tgt.z += (z + az - tgt.z) * k;
      place();
    },
    snap(x, z, vx = 0, vz = 0) {
      const [ax, az] = clampAhead(ahead(vx), ahead(vz));
      tgt.x = x + ax;
      tgt.z = z + az;
      place();
    },
    target: () => ({ ...tgt }),
  };
  rig.resize(width, height);
  return rig;
}
