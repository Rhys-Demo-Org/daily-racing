// Bot driver: the race opponent, and the driver the bot-lap gate (G2) uses on every track.
//
// It follows its own racing line, the centreline shifted sideways by a seeded offset, steering at a
// point a little way ahead on it (nearer in tight corners, so it never cuts across the inside). Its
// target speed is planned once per track from the curvature of its own line and scaled by a seeded
// pace factor; brakes at twice the planned cornering grip leave room to slow down in time. If it
// stops moving (nose in the props, wedged against a car) it reverses with opposite lock for a
// moment, then carries on.
// It only emits the same CarInput a player does: it never moves a car itself, and replays record
// its inputs like any other driver's. Its variation comes from an RNG seeded by the world seed and
// car index, so bots differ but every run is reproducible.
import type { CarInput } from './types.ts';
import type { CarState } from './car.ts';
import { CAR_LENGTH, SURFACES, forwardSpeed } from './car.ts';
import { COUNTDOWN_TICKS, lapGap } from './race.ts';
import { createRng, nextRange } from './rng.ts';
import { clamp, headingOf, wrapAngle } from './vec.ts';
import type { World } from './world.ts';

export const BOT_TUNING = {
  /** Sideways acceleration corners are planned with (dirt grip is 24), units/s². */
  planLateral: 20,
  /** Curvature is measured as the heading change across ± this many centreline samples. */
  curveSpan: 3,
  /** Steering aims this far ahead along the line: a base distance plus a time at current speed,
   * but no further than where the track has turned by lookTurn radians (and at least lookMin). */
  lookBase: 5,
  lookTime: 0.4,
  lookTurn: 0.5,
  lookMin: 2,
  /** Steer per radian of heading error. */
  steerGain: 2.5,
  /** Over the target speed the bot lifts; this much over, it brakes. */
  brakeMargin: 2,
  /** Passing: the nearest car up to passAhead units ahead whose centre is within passWidth of our
   * line is passed with passWidth between centres. */
  passAhead: 15,
  passWidth: 2.6,
  /** No passing over this distance before a ramp's foot, or on the ramp. */
  rampApproach: 25,
  /** Seeded range of the racing-line offset (± units from the centreline) and pace factor. */
  lineSpread: 1.5,
  paceMin: 0.93,
  paceMax: 0.99,
  /** Slower than stuckSpeed (units/s) for more than stuckTicks → reverse for reverseTicks. */
  stuckSpeed: 1,
  stuckTicks: 45,
  reverseTicks: 60,
} as const;

export interface Bot {
  /** This bot's input for the next tick. Call exactly once per tick, before stepWorld. */
  input(world: World): CarInput;
}

/** Creates the bot driving car `carIndex` of `world`. */
export function createBot(world: World, carIndex: number): Bot {
  const B = BOT_TUNING;
  const track = world.track;
  const n = track.count;
  // Its own stream (world.rng is left alone): the golden-ratio multiplier spreads nearby seeds apart.
  const rng = createRng(Math.imul(world.seed, 0x9e3779b1) + carIndex);
  /** Racing-line offset from the centreline (positive = right of the driving direction). */
  const offset = nextRange(rng, -B.lineSpread, B.lineSpread);
  /** Fraction of the planned speed this bot drives at. */
  const pace = nextRange(rng, B.paceMin, B.paceMax);
  /** Furthest the line may move off the centreline while passing, keeping the car on the dirt. */
  const maxLine = track.halfWidth - B.passWidth / 2;

  // Target speed at each centreline sample: what the corner allows on our line (v² = a / curvature;
  // offset by o, a curve of curvature k has curvature k / (1 − k·o)).
  const target = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h0 = track.headings[(i + n - B.curveSpan) % n] as number;
    const h1 = track.headings[(i + B.curveSpan) % n] as number;
    const k = wrapAngle(h1 - h0) / (2 * B.curveSpan * track.spacing);
    const curvature = Math.abs(k) / Math.max(0.1, 1 - k * offset);
    target[i] = pace * Math.min(SURFACES.dirt.topSpeed, Math.sqrt(B.planLateral / Math.max(curvature, 1e-9)));
  }
  // No passing on a ramp's approach, so the car leaves the lip on its own line, pointing down the
  // track (validateTrack keeps every full-speed jump inside the run-out after the lip).
  const noPass = new Uint8Array(n);
  track.data.ramps.forEach((r) => {
    const lip = Math.floor(r.at * n);
    for (let d = 0; d <= (r.length + B.rampApproach) / track.spacing; d++) noPass[(lip - d + n) % n] = 1;
  });

  let slowTicks = 0;
  let reverseTicks = 0;
  return {
    input(w) {
      const car = w.cars[carIndex] as CarState;
      const speed = forwardSpeed(car);
      const look = Math.ceil((B.lookBase + B.lookTime * Math.abs(speed)) / track.spacing);
      const h0 = track.headings[car.pos.seg] as number;
      let ahead = car.pos.seg;
      let tight = false;
      for (let j = 1; j <= look && !tight; j++) {
        const next = (car.pos.seg + j) % n;
        tight = j > B.lookMin && Math.abs(wrapAngle((track.headings[next] as number) - h0)) > B.lookTurn;
        if (!tight) ahead = next;
      }
      // The nearest car just ahead of us (or alongside) on our line: aim beside it, on the side
      // with more room. Not in tight corners, where a line beside it would clip the infield, nor
      // on a ramp's approach.
      let line = offset;
      let nearest: number = B.passAhead;
      for (let i = 0; i < w.cars.length && !tight && noPass[car.pos.seg] === 0; i++) {
        const other = w.cars[i] as CarState;
        // Signed distance ahead along the lap.
        const gap = lapGap(car.pos.s, other.pos.s, track.length);
        if (other === car || gap < -CAR_LENGTH || gap > nearest || Math.abs(other.pos.lateral - offset) > B.passWidth) continue;
        nearest = gap;
        line = clamp(other.pos.lateral > 0 ? other.pos.lateral - B.passWidth : other.pos.lateral + B.passWidth, -maxLine, maxLine);
      }
      const h = track.headings[ahead] as number;
      // Right of a heading is (cos h, sin h).
      const tx = (track.xs[ahead] as number) + Math.cos(h) * line;
      const tz = (track.zs[ahead] as number) + Math.sin(h) * line;
      const steer = clamp(wrapAngle(headingOf(tx - car.x, tz - car.z) - car.heading) * B.steerGain, -1, 1);
      if (reverseTicks > 0) {
        // Reversing flips the steering, so opposite lock still swings the nose toward the line.
        reverseTicks--;
        return { steer: -steer, throttle: false, brake: true };
      }
      slowTicks = w.tick >= COUNTDOWN_TICKS && Math.abs(speed) < B.stuckSpeed ? slowTicks + 1 : 0;
      if (slowTicks > B.stuckTicks) {
        slowTicks = 0;
        reverseTicks = B.reverseTicks;
      }
      const want = target[car.pos.seg] as number;
      return { steer, throttle: speed < want, brake: speed > want + B.brakeMargin };
    },
  };
}
