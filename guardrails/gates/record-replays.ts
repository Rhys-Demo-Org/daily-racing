// Records gate 3's starter replays into tests/baselines/replays/ (owner-only, via rebaseline.sh).
// Only missing recordings are written: inputs are frozen once recorded, and rebaseline only
// refreshes their expected end states. Each scenario checks that its event really happened.
//
//   node guardrails/gates/record-replays.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CarInput, CarView, TrackData } from '../../src/sim/index.ts';
import { carViews, createBot, createReplay, createWorld, encodeReplay, raceView, stepWorld, trackLayout } from '../../src/sim/index.ts';
import type { World } from '../../src/sim/index.ts';
import { clamp, headingOf, wrapAngle } from '../../src/sim/vec.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const track = JSON.parse(readFileSync(join(root, 'src', 'content', 'tracks', 'dust-bowl.json'), 'utf8')) as TrackData;
const GO = 180;

/** Full throttle toward (x, z). */
function toward(world: World, car: number, x: number, z: number): CarInput {
  const c = world.cars[car]!;
  return { steer: clamp(wrapAngle(headingOf(x - c.x, z - c.z) - c.heading) * 2.5, -1, 1), throttle: true, brake: false };
}

interface Run {
  /** Inputs for this tick, or null to stop recording. */
  drive(world: World, tick: number): CarInput[] | null;
  /** True when the event happened, given the car views after every tick. */
  check(views: CarView[][]): boolean;
}
interface Scenario {
  cars: number;
  seed: number;
  start(world: World): Run;
}

const bale = trackLayout(track).props.find((p) => p.kind === 'hay-bale')!;
const SCENARIOS: Record<string, Scenario> = {
  // Flat out, then full lock at top speed: the car slides.
  drift: {
    cars: 1,
    seed: 1,
    start: () => ({
      drive: (_, t) => (t > GO + 300 ? null : [{ steer: t > GO + 180 ? 1 : 0, throttle: true, brake: false }]),
      check: (v) => v.some((cars) => cars[0]!.slip > 0.5),
    }),
  },
  // The bot over the ramp, recorded until a second after it lands.
  jump: {
    cars: 1,
    seed: 2,
    start: (world) => {
      const bot = createBot(world, 0);
      let landed = -1;
      return {
        drive: (w, t) => {
          if (landed < 0 && w.cars[0]!.airborne) landed = 0;
          if (landed >= 0 && !w.cars[0]!.airborne) landed++;
          return landed > 60 || t > GO + 900 ? null : [bot.input(w)];
        },
        check: (v) => v.some((cars) => cars[0]!.airborne),
      };
    },
  },
  // Straight into the first hay bale beside the track: it bleeds speed.
  'prop-collision': {
    cars: 1,
    seed: 3,
    start: () => ({
      drive: (w, t) => (t > GO + 300 ? null : [toward(w, 0, bale.x, bale.z)]),
      check: (v) => v.some((cars, t) => t > 0 && v[t - 1]![0]!.speed - cars[0]!.speed > 1),
    }),
  },
  // Car 0 waits on the grid; car 1 (right column, a row back) drives into it and shoves it.
  'car-contact': {
    cars: 2,
    seed: 4,
    start: () => ({
      drive: (w, t) => (t > GO + 300 ? null : [{ steer: 0, throttle: false, brake: false }, toward(w, 1, w.cars[0]!.x, w.cars[0]!.z)]),
      check: (v) => Math.hypot(v.at(-1)![0]!.x - v[0]![0]!.x, v.at(-1)![0]!.z - v[0]![0]!.z) > 0.5,
    }),
  },
  // Two bots, the full three-lap race.
  'bot-race': {
    cars: 2,
    seed: 5,
    start: (world) => {
      const bots = [createBot(world, 0), createBot(world, 1)];
      const done = (w: World): boolean => raceView(w).racers.every((r) => r.finishTick !== null);
      return {
        drive: (w, t) => (done(w) || t > 60 * 300 ? null : bots.map((b) => b.input(w))),
        check: () => done(world),
      };
    },
  },
};

const dir = join(root, 'tests', 'baselines', 'replays');
mkdirSync(dir, { recursive: true });
for (const [name, sc] of Object.entries(SCENARIOS)) {
  const file = join(dir, `${name}.json`);
  if (existsSync(file)) continue;
  const world = createWorld(track, { seed: sc.seed, carCount: sc.cars });
  const run = sc.start(world);
  const frames: CarInput[][] = [];
  const views: CarView[][] = [];
  for (let t = 0; ; t++) {
    const inputs = run.drive(world, t);
    if (inputs === null) break;
    stepWorld(world, inputs);
    frames.push(inputs);
    views.push(carViews(world));
  }
  if (!run.check(views)) throw new Error(`replay ${name}: its event never happened; adjust the scenario`);
  writeFileSync(file, `${encodeReplay(createReplay(track.id, sc.seed, sc.cars, frames))}\n`);
  console.log(`recorded ${name} (${frames.length} ticks)`);
}
