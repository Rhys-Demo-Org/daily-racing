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
import type { Collider, Ground, Ramp, Track, TrackPos } from './track.ts';
import { groundAt, nearestGlobal, surfaceAt, trackPosition } from './track.ts';
import { clamp, wrapAngle } from './vec.ts';

export const DT = 1 / TICK_HZ;
/** Car footprint in units. */
export const CAR_LENGTH = 4.2;
export const CAR_WIDTH = 2.2;
/** Height of the car's collision box: cars whose bases are further apart than this pass over each other. */
const CAR_HEIGHT = 1.1;

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
  /** Highest step a grounded car can climb in one tick; a taller ramp face (the lip seen from
   * beyond, or a side) is a wall. Ramp slopes must rise less than this per tick at top speed (see
   * MAX_RAMP_SLOPE). It applies on every track: fine while no replay baselines exist (before G3). */
  maxStepUp: 0.3,
  /** Push-outs may move a car at most this much further in a tick than its own speed does; the
   * rest carries over to later ticks. At top speed that keeps every tick's move under G2's
   * teleport limit (topSpeed × DT × 1.5), however cars and props pile up. */
  maxPush: 0.2,
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
export function carView(car: CarState, track: Track): CarView {
  const speed = forwardSpeed(car);
  const { y, pitch } = visualPose(car, track, speed);
  return {
    x: car.x,
    y,
    z: car.z,
    heading: car.heading,
    pitch,
    speed,
    slip: car.slip,
    surface: car.surface,
    airborne: car.airborne,
  };
}

/**
 * Body height and tilt for drawing (never fed back into physics). Along the body axis the ground is
 * piecewise linear (flat, ramp slopes, a drop at each lip), so the body rests on its upper convex
 * hull: sample the nose, tail, centre and every ramp foot/lip in between, and take the hull edge
 * above the centre. Airborne, the nose follows the trajectory, clamped so neither end of the body
 * dips below flat ground.
 */
function visualPose(car: CarState, track: Track, speed: number): { y: number; pitch: number } {
  if (car.airborne) {
    const limit = Math.atan2(Math.max(car.y, 0), HALF_LENGTH);
    const climb = speed >= 0 ? car.vy : -car.vy;
    return { y: car.y, pitch: clamp(Math.atan2(climb, Math.abs(speed) + 1e-6), -limit, limit) };
  }
  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const ts = [-HALF_LENGTH, 0, HALF_LENGTH];
  for (const r of track.ramps) {
    const rate = fx * r.fx + fz * r.fz; // ramp "along" coordinate per unit along the body
    if (Math.abs(rate) < 1e-9) continue;
    const along = (car.x - r.x) * r.fx + (car.z - r.z) * r.fz;
    // Lip sampled a hair on the slope side so it reads the lip's full height.
    for (const a of [-1e-6, -r.length]) {
      const t = (a - along) / rate;
      if (Math.abs(t) < HALF_LENGTH) ts.push(t);
    }
  }
  const hs = ts.map((t) => groundAt(track, car.x + fx * t, car.z + fz * t).h);
  let y = -Infinity;
  let pitch = 0;
  for (let i = 0; i < ts.length; i++) {
    const ti = ts[i] as number;
    if (ti > 0) continue;
    for (let j = 0; j < ts.length; j++) {
      const tj = ts[j] as number;
      if (tj < 0 || tj === ti) continue;
      const k = ((hs[j] as number) - (hs[i] as number)) / (tj - ti);
      const atCentre = (hs[i] as number) - k * ti;
      if (atCentre > y) {
        y = atCentre;
        pitch = Math.atan(k);
      }
    }
  }
  // Resting on a prop top or car roof (above the ground under it): sit level at that height.
  return y >= car.y ? { y, pitch } : { y: car.y, pitch: 0 };
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
 * Advances every car by one tick (mutating them): inputs change each car's velocity, then all cars
 * move together so they collide with props and with each other, then heights and track positions
 * update.
 */
export function stepCars(cars: readonly CarState[], inputs: readonly CarInput[], track: Track): void {
  let steps = 1;
  for (let k = 0; k < cars.length; k++) {
    const car = cars[k] as CarState;
    start[k * 3] = car.x;
    start[k * 3 + 1] = car.z;
    applyInput(car, inputs[k] as CarInput);
    const travel = Math.hypot(car.vx, car.vz) * DT;
    start[k * 3 + 2] = travel;
    steps = Math.max(steps, Math.ceil(travel / CAR_TUNING.maxSubstep));
    // Broadphase once per tick: the travel plus a margin for push-outs bounds where the car can get.
    gatherNearby((nearby[k] ??= []), car, track, travel);
  }
  moveWithCollisions(cars, track, steps);
  for (let k = 0; k < cars.length; k++) {
    const car = cars[k] as CarState;
    updateVertical(car, k, cars, track);
    car.pos = trackPosition(track, car.x, car.z, car.pos);
    car.surface = surfaceAt(track, car.pos, car.x, car.z);
  }
}

/** Engine, brakes, steering and grip for one tick. In the air, steering and throttle do nothing and
 * the car follows a ballistic arc until it lands. */
function applyInput(car: CarState, input: CarInput): void {
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
    car.heading = wrapAngle(car.heading + yaw * DT);

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
}

/** Per car, indices of the props it could reach this tick, ascending (so contacts resolve in the
 * same order as a scan of every prop would). Scratch reused every tick, so ticks don't allocate. */
const nearby: number[][] = [];
/** Scratch for groundAt on the hot path. */
const ground: Ground = { h: 0, gx: 0, gz: 0, ramp: null };
/** Per car (3 slots each): x and z at the start of the tick, and its travel this tick. Scratch,
 * for capping push-outs. */
const start: number[] = [];

/** Fills `list` with the props within reach of a car that travels `travel` this tick, via the grid. */
function gatherNearby(list: number[], car: CarState, track: Track, travel: number): void {
  const g = track.grid;
  const r = CAR_BOUND + g.maxBound + travel + 2; // a margin beyond any reach below
  const i1 = Math.min(g.cols - 1, Math.floor((car.x + r - g.x0) / g.cell));
  const j0 = Math.max(0, Math.floor((car.z - r - g.z0) / g.cell));
  const j1 = Math.min(g.rows - 1, Math.floor((car.z + r - g.z0) / g.cell));
  list.length = 0;
  for (let i = Math.max(0, Math.floor((car.x - r - g.x0) / g.cell)); i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const id of g.cells[i * g.rows + j] as number[]) {
        const c = track.colliders[id] as Collider;
        const dx = c.x - car.x;
        const dz = c.z - car.z;
        const reach = CAR_BOUND + c.bound + travel + 1;
        if (dx * dx + dz * dz > reach * reach) continue;
        let n = list.length; // insertion keeps the list ascending
        for (; n > 0 && (list[n - 1] as number) > id; n--) list[n] = list[n - 1] as number;
        list[n] = id;
      }
    }
  }
}

/**
 * Integrates horizontal motion in `steps` shared sub-steps, each no longer than `maxSubstep` for
 * the fastest car (so the count depends on every car: deterministic, but G2 must keep its car count
 * fixed). After each one, each pair of cars (i < j, a fixed order) resolves its contact, then every
 * car resolves its prop contacts: props can't move, so they have the last word and nothing passes
 * through anything, even at top speed. A grounded car can't climb a ramp face taller than
 * `maxStepUp`: the face acts as a wall. Finally push-outs are capped at `maxPush` per tick.
 */
function moveWithCollisions(cars: readonly CarState[], track: Track, steps: number): void {
  for (let i = 0; i < steps; i++) {
    for (const car of cars) {
      const x0 = car.x;
      const z0 = car.z;
      // Velocity can change on impact, so recompute the step from the current velocity.
      car.x += (car.vx * DT) / steps;
      car.z += (car.vz * DT) / steps;
      if (!car.airborne) {
        const g = groundAt(track, car.x, car.z, ground);
        if (g.ramp !== null && g.h - car.y > CAR_TUNING.maxStepUp) hitRampFace(car, g.ramp, x0, z0);
      }
    }
    for (let a = 0; a < cars.length; a++) {
      for (let b = a + 1; b < cars.length; b++) collideCars(cars[a] as CarState, cars[b] as CarState);
    }
    for (let k = 0; k < cars.length; k++) collideProps(cars[k] as CarState, k, track);
  }
  for (let k = 0; k < cars.length; k++) {
    const car = cars[k] as CarState;
    const x0 = start[k * 3] as number;
    const z0 = start[k * 3 + 1] as number;
    const moved = Math.hypot(car.x - x0, car.z - z0);
    const limit = (start[k * 3 + 2] as number) + CAR_TUNING.maxPush;
    if (moved > limit) {
      car.x = x0 + ((car.x - x0) * limit) / moved;
      car.z = z0 + ((car.z - z0) * limit) / moved;
    }
  }
}

/** Two passes push car `k` out of the props it overlaps (and isn't above). */
function collideProps(car: CarState, k: number, track: Track): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const id of nearby[k] as number[]) {
      const c = track.colliders[id] as Collider;
      if (car.y >= c.top) continue;
      const dx = c.x - car.x;
      const dz = c.z - car.z;
      const reach = CAR_BOUND + c.bound;
      if (dx * dx + dz * dz <= reach * reach && touches(car, c)) resolveContact(car, hit.nx, hit.nz, hit.depth);
    }
  }
}

/** The car moved from (x0, z0) into a ramp face: the lip if it came from beyond the ramp, otherwise
 * the side it came from. Like a prop, the face takes back the part of the move into it (the car
 * can still slide along) and bounces the car off. */
function hitRampFace(car: CarState, r: Ramp, x0: number, z0: number): void {
  const side = (x0 - r.x) * -r.fz + (z0 - r.z) * r.fx > 0 ? 1 : -1;
  const beyond = (x0 - r.x) * r.fx + (z0 - r.z) * r.fz > 0;
  const nx = beyond ? r.fx : -r.fz * side;
  const nz = beyond ? r.fz : r.fx * side;
  resolveContact(car, nx, nz, Math.max(0, -((car.x - x0) * nx + (car.z - z0) * nz)));
}

/** Car–car contact: the same oriented-box test as hay bales, with the other car as the box. Cars
 * whose heights don't overlap (one flying over the other) pass. Like any box contact it resolves
 * along the shallower axis: when the cars overlap less in height than sideways (one coming down on
 * the other), the upper car is lifted onto the other's roof instead of being shoved sideways. */
function collideCars(a: CarState, b: CarState): void {
  const dy = a.y - b.y;
  if (Math.abs(dy) >= CAR_HEIGHT) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz > 4 * CAR_BOUND * CAR_BOUND || !contactBox(a, b.x, b.z, b.heading, HALF_LENGTH, HALF_WIDTH)) return;
  if (CAR_HEIGHT - Math.abs(dy) >= hit.depth) resolveContact(a, hit.nx, hit.nz, hit.depth, b);
  else if (dy > 0) liftOnto(a, b);
  else liftOnto(b, a);
}

function liftOnto(upper: CarState, lower: CarState): void {
  upper.y = lower.y + CAR_HEIGHT;
  upper.vy = Math.max(upper.vy, lower.vy);
}

/** Whether the car's footprint overlaps prop `c` (fills `hit` if so). */
function touches(car: CarState, c: Collider): boolean {
  return c.shape === 'circle'
    ? contactCircle(car, c.x, c.z, c.r)
    : contactBox(car, c.x, c.z, c.heading, c.halfLength, c.halfWidth);
}

/** The highest top the car is level with or above, of a prop centred under its footprint or a car
 * it overlaps (0 if none). The car rests on it, like ground, instead of sinking in and being pushed
 * out sideways; a prop only clipped by the car's edge pushes it off instead. `k` is the car's index
 * in `cars`. */
function restingTop(car: CarState, k: number, cars: readonly CarState[], track: Track): number {
  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  let top = 0;
  for (const id of nearby[k] as number[]) {
    const c = track.colliders[id] as Collider;
    if (car.y < c.top || c.top <= top) continue;
    const dx = c.x - car.x;
    const dz = c.z - car.z;
    if (Math.abs(dx * fx + dz * fz) <= HALF_LENGTH && Math.abs(dz * fx - dx * fz) <= HALF_WIDTH) top = c.top;
  }
  for (const other of cars) {
    const roof = other.y + CAR_HEIGHT;
    if (other !== car && car.y >= roof && roof > top && contactBox(car, other.x, other.z, other.heading, HALF_LENGTH, HALF_WIDTH)) top = roof;
  }
  return top;
}

/** The last contact found by contactCircle/contactBox: the unit normal pushing the car out of the
 * prop (or other car) and the depth. Scratch, so collisions don't allocate. */
const hit = { nx: 0, nz: 0, depth: 0 };

/** Car box vs circle: closest point on the box to the circle centre. Fills `hit` on contact. */
function contactCircle(car: CarState, cx: number, cz: number, r: number): boolean {
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
  if (d2 >= r * r) return false;
  let nlx: number;
  let nly: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nly = ey / d;
    hit.depth = r - d;
  } else {
    // Circle centre inside the box (only possible if something went very wrong): leave by the
    // nearest face.
    const penX = HALF_LENGTH - Math.abs(lx);
    const penY = HALF_WIDTH - Math.abs(ly);
    if (penX < penY) {
      nlx = lx >= 0 ? 1 : -1;
      nly = 0;
      hit.depth = penX + r;
    } else {
      nlx = 0;
      nly = ly >= 0 ? 1 : -1;
      hit.depth = penY + r;
    }
  }
  // (nlx, nly) points from the car toward the circle; the car moves the other way.
  hit.nx = -(nlx * fx + nly * rx);
  hit.nz = -(nlx * fz + nly * rz);
  return true;
}

/** Car box vs oriented box (a hay bale or another car): separating axis test over the four face
 * normals. Fills `hit` on contact, with the normal pushing the car away from the box. */
function contactBox(car: CarState, bx: number, bz: number, heading: number, halfLength: number, halfWidth: number): boolean {
  const afx = Math.sin(car.heading);
  const afz = -Math.cos(car.heading);
  const bfx = Math.sin(heading);
  const bfz = -Math.cos(heading);
  const dx = bx - car.x;
  const dz = bz - car.z;
  hit.depth = Infinity;
  for (let k = 0; k < 4; k++) {
    // Axes: the car's forward and right, then the box's (right of forward (fx, fz) is (−fz, fx)).
    const fx = k < 2 ? afx : bfx;
    const fz = k < 2 ? afz : bfz;
    const ax = k % 2 === 0 ? fx : -fz;
    const az = k % 2 === 0 ? fz : fx;
    const ra = HALF_LENGTH * Math.abs(afx * ax + afz * az) + HALF_WIDTH * Math.abs(-afz * ax + afx * az);
    const rb = halfLength * Math.abs(bfx * ax + bfz * az) + halfWidth * Math.abs(-bfz * ax + bfx * az);
    const d = dx * ax + dz * az;
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return false;
    if (overlap < hit.depth) {
      const sign = d > 0 ? -1 : 1; // push the car away from the box centre
      hit.nx = ax * sign;
      hit.nz = az * sign;
      hit.depth = overlap;
    }
  }
  return true;
}

/**
 * Pushes the car out along the normal, bounces the closing velocity a little and bleeds speed in
 * proportion to how hard it hit. Against another car (equal mass) each car takes half the push-out
 * and half the impulse, in opposite directions. Positions change only by the penetration depth
 * (never a teleport).
 */
function resolveContact(car: CarState, nx: number, nz: number, depth: number, other?: CarState): void {
  const T = CAR_TUNING;
  const share = other ? 0.5 : 1;
  car.x += nx * depth * share;
  car.z += nz * depth * share;
  if (other) {
    other.x -= nx * depth * share;
    other.z -= nz * depth * share;
  }
  const vn = (car.vx - (other?.vx ?? 0)) * nx + (car.vz - (other?.vz ?? 0)) * nz;
  if (vn >= 0) return;
  const j = (1 + T.restitution) * vn * share;
  const keep = 1 - clamp(-vn * T.impactBleed, 0, T.impactBleedMax);
  car.vx = (car.vx - j * nx) * keep;
  car.vz = (car.vz - j * nz) * keep;
  if (other) {
    other.vx = (other.vx + j * nx) * keep;
    other.vz = (other.vz + j * nz) * keep;
  }
}

/**
 * Height handling. Grounded cars follow the ground (vy = velocity · slope); a prop top or car roof
 * the car is on counts as flat ground. Each tick we predict where a free-flying car would be; if
 * that is above the ground (e.g. the ground fell away past a ramp lip), the car becomes airborne
 * with its current vertical speed and falls under gravity until it touches down.
 */
function updateVertical(car: CarState, k: number, cars: readonly CarState[], track: Track): void {
  const T = CAR_TUNING;
  const g = groundAt(track, car.x, car.z, ground);
  const top = restingTop(car, k, cars, track);
  if (top > g.h) {
    g.h = top;
    g.gx = 0;
    g.gz = 0;
  }
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
