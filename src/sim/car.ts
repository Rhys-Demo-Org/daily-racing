// Arcade car physics on the fixed 60 Hz step. The car is a 2D box on the XZ plane plus a scalar
// height for jumps. Velocity is kept in world space and split each tick into a forward and a
// lateral part relative to the car's heading:
//   - forward: engine, brakes/reverse, coasting drag;
//   - lateral: tyre grip removes sideways velocity up to a traction limit (an acceleration). Turning
//     hard at speed creates more sideways velocity per tick than grip can remove, so the car starts
//     sliding; while sliding grip drops further (hysteresis) until the slide is caught. That is the
//     drift. `slip` reports how much sideways velocity there is, 0..1.
import type { CarInput, CarView, Surface } from './types.ts';
import { TICK_HZ } from './types.ts';
import type { Collider, Track, TrackPos } from './track.ts';
import { groundAt, nearestGlobal, surfaceAt, trackPosition } from './track.ts';
import { clamp } from './vec.ts';

export const DT = 1 / TICK_HZ;
/** Car footprint in units. */
export const CAR_LENGTH = 4.2;
export const CAR_WIDTH = 2.2;

export interface SurfaceTuning {
  /** Speed the engine can reach on this surface, units/s. */
  topSpeed: number;
  /** Engine acceleration from standstill, units/s². Tapers to 0 at topSpeed. */
  accel: number;
  /** Maximum sideways acceleration tyres can apply while gripping, units/s². */
  grip: number;
  /** Deceleration when coasting: constant part (units/s²) plus a per-speed part (1/s). */
  coastDecel: number;
  coastDrag: number;
}

export const SURFACES: Readonly<Record<Surface, SurfaceTuning>> = {
  dirt: { topSpeed: 25, accel: 30, grip: 24, coastDecel: 4, coastDrag: 0.1 },
  grass: { topSpeed: 15, accel: 20, grip: 14, coastDecel: 8, coastDrag: 0.25 },
};

export const CAR_TUNING = {
  /** Braking deceleration, units/s². */
  brake: 40,
  /** Reverse top speed and acceleration. */
  reverseSpeed: 9,
  reverseAccel: 16,
  /** Above the surface's top speed (e.g. running onto grass) speed decays at this rate, 1/s. */
  overSpeedDrag: 2.2,
  /** Peak yaw rate at full steer, rad/s. */
  maxYawRate: 2.8,
  /** Steering ramps in from 0 at standstill to full authority at this speed. */
  steerFullSpeed: 6,
  /** Fraction of steering authority removed at top speed (more stable at speed). */
  steerHighSpeedCut: 0.3,
  /** Sliding starts when sideways speed exceeds `slideEnter` and ends below `slideExit`. */
  slideEnter: 3,
  slideExit: 2,
  /** Grip multiplier while sliding. */
  slideGrip: 0.75,
  /** Sideways speed that counts as slip = 1. */
  slipFull: 6,
  /** Forward speed lost per unit of sideways speed while sliding, 1/s. */
  slideScrub: 0.3,
  /** Drift angle (rad) where steering further into the slide starts to fade, and where it is gone. */
  driftAngleSoft: 0.6,
  driftAngleHard: 1.0,
  /** Gravity for jumps, units/s². Stronger than real so jumps feel snappy. */
  gravity: 22,
  /** Fraction of horizontal speed kept on landing. */
  landingKeep: 0.96,
  /** Collision response: bounce off the contact normal, and lose this share of speed per unit/s of
   * impact speed (capped). */
  restitution: 0.2,
  impactBleed: 0.025,
  impactBleedMax: 0.6,
  /** Longest distance the car moves between collision checks, so it cannot tunnel. */
  maxSubstep: 0.2,
} as const;

const HALF_LENGTH = CAR_LENGTH / 2;
const HALF_WIDTH = CAR_WIDTH / 2;
const CAR_BOUND = Math.hypot(HALF_LENGTH, HALF_WIDTH);

/** Full internal car state. Render/UI read `carView` instead. */
export interface CarState {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** World-space horizontal velocity. */
  vx: number;
  vz: number;
  /** Vertical velocity (jumps; follows ramp slope while grounded). */
  vy: number;
  airborne: boolean;
  sliding: boolean;
  slip: number;
  surface: Surface;
  /** Tracked position on the centreline (local search hint for next tick). */
  pos: TrackPos;
}

/** A stationary, grounded car at (x, z) facing `heading`. */
export function createCar(track: Track, x: number, z: number, heading: number): CarState {
  const pos = nearestGlobal(track, x, z);
  return {
    x,
    y: groundAt(track, x, z).h,
    z,
    heading,
    vx: 0,
    vz: 0,
    vy: 0,
    airborne: false,
    sliding: false,
    slip: 0,
    surface: surfaceAt(track, pos, x, z),
    pos,
  };
}

/** Signed forward speed (negative when reversing). */
export function forwardSpeed(car: CarState): number {
  return car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
}

/** Read-only view for render/UI. */
export function carView(car: CarState): CarView {
  return {
    x: car.x,
    y: car.y,
    z: car.z,
    heading: car.heading,
    speed: forwardSpeed(car),
    slip: car.slip,
    surface: car.surface,
    airborne: car.airborne,
  };
}

/** Moves `v` toward 0 by at most `amount`, never crossing 0. */
function towardZero(v: number, amount: number): number {
  return v > 0 ? Math.max(0, v - amount) : Math.min(0, v + amount);
}

/** Yaw rate available at a given forward speed: none at standstill, full at moderate speed, a bit
 * less at top speed. */
function yawAuthority(speed: number): number {
  const a = Math.abs(speed);
  const low = clamp(a / CAR_TUNING.steerFullSpeed, 0, 1);
  const high = 1 - CAR_TUNING.steerHighSpeedCut * clamp((a - 8) / 18, 0, 1);
  return CAR_TUNING.maxYawRate * low * high;
}

/** New forward speed after engine, brakes/reverse and drag for one tick. */
function longitudinal(vf: number, input: CarInput, s: SurfaceTuning): number {
  const T = CAR_TUNING;
  let v = vf;
  if (input.brake) {
    if (v > 0.5) {
      v = Math.max(0, v - T.brake * DT);
    } else {
      // Stopped (or already reversing): brake becomes reverse throttle.
      const back = Math.max(0, -v) / T.reverseSpeed;
      v -= T.reverseAccel * Math.max(0, 1 - back * back) * DT;
    }
  } else if (input.throttle) {
    if (v < -0.5) {
      v = Math.min(0, v + T.brake * DT);
    } else if (v < s.topSpeed) {
      const u = Math.max(0, v) / s.topSpeed;
      v = Math.min(s.topSpeed, v + s.accel * (1 - u * u) * DT);
    }
  } else {
    v = towardZero(v, (s.coastDecel + s.coastDrag * Math.abs(v)) * DT);
  }
  if (v > s.topSpeed) v = Math.max(s.topSpeed, v - T.overSpeedDrag * (v - s.topSpeed) * DT);
  return v;
}

/**
 * Advances one car by one tick. Mutates `car`. In the air, steering and throttle do nothing and
 * the car follows a ballistic arc until it lands.
 */
export function stepCar(car: CarState, input: CarInput, track: Track): void {
  const T = CAR_TUNING;
  if (!car.airborne) {
    const surf = SURFACES[car.surface];
    let fx = Math.sin(car.heading);
    let fz = -Math.cos(car.heading);
    const vf0 = car.vx * fx + car.vz * fz;
    const vl0 = car.vx * -fz + car.vz * fx;

    // Steering. Reversing flips the turn direction like a real car. Steering further into a big
    // drift angle fades out so a slide stays catchable instead of spinning the car.
    let yaw = input.steer * yawAuthority(vf0) * (vf0 < 0 ? -1 : 1);
    const driftAngle = Math.atan2(-vl0, Math.abs(vf0) + 1e-6); // >0 when the nose points right of travel
    if (yaw * driftAngle > 0) {
      const fade = clamp((Math.abs(driftAngle) - T.driftAngleSoft) / (T.driftAngleHard - T.driftAngleSoft), 0, 1);
      yaw *= 1 - fade;
    }
    car.heading += yaw * DT;
    // Keep heading in a bounded range without changing behaviour.
    if (car.heading > Math.PI) car.heading -= Math.PI * 2;
    else if (car.heading <= -Math.PI) car.heading += Math.PI * 2;

    // Re-split the (unchanged) velocity in the new heading frame.
    fx = Math.sin(car.heading);
    fz = -Math.cos(car.heading);
    let vf = car.vx * fx + car.vz * fz;
    let vl = car.vx * -fz + car.vz * fx;

    vf = longitudinal(vf, input, surf);
    if (car.sliding) vf = towardZero(vf, T.slideScrub * Math.abs(vl) * DT);

    // Grip: remove sideways speed up to the traction limit.
    if (!car.sliding && Math.abs(vl) > T.slideEnter) car.sliding = true;
    const grip = surf.grip * (car.sliding ? T.slideGrip : 1);
    vl = towardZero(vl, grip * DT);
    if (car.sliding && Math.abs(vl) < T.slideExit) car.sliding = false;
    car.slip = clamp(Math.abs(vl) / T.slipFull, 0, 1);

    car.vx = fx * vf - fz * vl;
    car.vz = fz * vf + fx * vl;
  } else {
    car.slip = 0;
  }

  moveWithCollisions(car, track.colliders);
  updateVertical(car, track);
  car.pos = trackPosition(track, car.x, car.z, car.pos);
  car.surface = surfaceAt(track, car.pos, car.x, car.z);
}

/** Integrates horizontal motion in sub-steps no longer than `maxSubstep`, resolving prop contacts
 * after each one, so even at top speed the car cannot pass through a prop. */
function moveWithCollisions(car: CarState, colliders: readonly Collider[]): void {
  const dist = Math.hypot(car.vx, car.vz) * DT;
  const steps = Math.max(1, Math.ceil(dist / CAR_TUNING.maxSubstep));
  for (let i = 0; i < steps; i++) {
    // Velocity can change on impact, so recompute the step from the current velocity.
    car.x += (car.vx * DT) / steps;
    car.z += (car.vz * DT) / steps;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        if (car.y > c.top) continue;
        const dx = c.x - car.x;
        const dz = c.z - car.z;
        const reach = CAR_BOUND + c.bound;
        if (dx * dx + dz * dz > reach * reach) continue;
        const hit = c.shape === 'circle' ? contactCircle(car, c.x, c.z, c.r) : contactBox(car, c);
        if (hit !== null) resolveContact(car, hit.nx, hit.nz, hit.depth);
      }
    }
  }
}

interface Contact {
  /** Unit normal pushing the car out of the prop. */
  nx: number;
  nz: number;
  depth: number;
}

/** Car box vs circle: closest point on the box to the circle centre. */
function contactCircle(car: CarState, cx: number, cz: number, r: number): Contact | null {
  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const rx = -fz;
  const rz = fx;
  const dx = cx - car.x;
  const dz = cz - car.z;
  const lx = dx * fx + dz * fz;
  const ly = dx * rx + dz * rz;
  const qx = clamp(lx, -HALF_LENGTH, HALF_LENGTH);
  const qy = clamp(ly, -HALF_WIDTH, HALF_WIDTH);
  const ex = lx - qx;
  const ey = ly - qy;
  const d2 = ex * ex + ey * ey;
  if (d2 >= r * r) return null;
  let nlx: number;
  let nly: number;
  let depth: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nly = ey / d;
    depth = r - d;
  } else {
    // Circle centre inside the box (only possible if something went very wrong): leave by the
    // nearest face.
    const penX = HALF_LENGTH - Math.abs(lx);
    const penY = HALF_WIDTH - Math.abs(ly);
    if (penX < penY) {
      nlx = lx >= 0 ? 1 : -1;
      nly = 0;
      depth = penX + r;
    } else {
      nlx = 0;
      nly = ly >= 0 ? 1 : -1;
      depth = penY + r;
    }
  }
  // (nlx, nly) points from the car toward the circle; the car moves the other way.
  return { nx: -(nlx * fx + nly * rx), nz: -(nlx * fz + nly * rz), depth };
}

/** Car box vs oriented box (separating axis test over the four face normals). */
function contactBox(car: CarState, b: Extract<Collider, { shape: 'box' }>): Contact | null {
  const af = [Math.sin(car.heading), -Math.cos(car.heading)] as const;
  const ar = [-af[1], af[0]] as const;
  const bf = [Math.sin(b.heading), -Math.cos(b.heading)] as const;
  const br = [-bf[1], bf[0]] as const;
  const dx = b.x - car.x;
  const dz = b.z - car.z;
  let best: Contact | null = null;
  for (const axis of [af, ar, bf, br]) {
    const ax = axis[0];
    const az = axis[1];
    const ra = HALF_LENGTH * Math.abs(af[0] * ax + af[1] * az) + HALF_WIDTH * Math.abs(ar[0] * ax + ar[1] * az);
    const rb = b.halfLength * Math.abs(bf[0] * ax + bf[1] * az) + b.halfWidth * Math.abs(br[0] * ax + br[1] * az);
    const d = dx * ax + dz * az;
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (best === null || overlap < best.depth) {
      const sign = d > 0 ? -1 : 1; // push the car away from the box centre
      best = { nx: ax * sign, nz: az * sign, depth: overlap };
    }
  }
  return best;
}

/** Pushes the car out along the normal, bounces the inward velocity a little and bleeds speed in
 * proportion to how hard it hit. Position changes only by the penetration depth (never a teleport). */
function resolveContact(car: CarState, nx: number, nz: number, depth: number): void {
  const T = CAR_TUNING;
  car.x += nx * depth;
  car.z += nz * depth;
  const vn = car.vx * nx + car.vz * nz;
  if (vn >= 0) return;
  car.vx -= (1 + T.restitution) * vn * nx;
  car.vz -= (1 + T.restitution) * vn * nz;
  const keep = 1 - clamp(-vn * T.impactBleed, 0, T.impactBleedMax);
  car.vx *= keep;
  car.vz *= keep;
}

/**
 * Height handling. Grounded cars follow the ground (vy = velocity · slope). Each tick we predict
 * where a free-flying car would be; if that is above the ground (e.g. the ground fell away past a
 * ramp lip), the car becomes airborne with its current vertical speed and falls under gravity
 * until it touches down.
 */
function updateVertical(car: CarState, track: Track): void {
  const T = CAR_TUNING;
  const g = groundAt(track, car.x, car.z);
  if (car.airborne) {
    car.vy -= T.gravity * DT;
    car.y += car.vy * DT;
    if (car.y <= g.h) {
      car.y = g.h;
      car.airborne = false;
      car.vx *= T.landingKeep;
      car.vz *= T.landingKeep;
      car.vy = car.vx * g.gx + car.vz * g.gz;
    }
    return;
  }
  const yFree = car.y + car.vy * DT - 0.5 * T.gravity * DT * DT;
  if (yFree > g.h + 0.01) {
    car.airborne = true;
    car.vy -= T.gravity * DT;
    car.y = yFree;
  } else {
    car.y = g.h;
    car.vy = car.vx * g.gx + car.vz * g.gz;
  }
}
