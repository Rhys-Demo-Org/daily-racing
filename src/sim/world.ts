// The world: track, cars and race state, advanced one fixed tick at a time.
import type { CarInput, CarView, RaceView, TrackData } from './types.ts';
import type { CarState } from './car.ts';
import { carView, createCar, stepCar } from './car.ts';
import type { RacerState } from './race.ts';
import {
  COUNTDOWN_TICKS,
  countdownValue,
  createRacer,
  positions,
  raceDistance,
  racePhase,
  racerView,
  updateRacer,
} from './race.ts';
import type { Rng } from './rng.ts';
import { createRng, nextRange } from './rng.ts';
import type { Track } from './track.ts';
import { buildTrack, validateTrack } from './track.ts';

export interface WorldOptions {
  seed: number;
  /** Number of cars; car 0 is the player. */
  carCount: number;
}

export interface World {
  track: Track;
  seed: number;
  rng: Rng;
  /** Ticks stepped since creation (the countdown is the first COUNTDOWN_TICKS of them). */
  tick: number;
  cars: CarState[];
  racers: RacerState[];
}

/** Distance from the start line to the first grid slot, and between rows, in units. */
const GRID_FIRST = 6;
const GRID_ROW_GAP = 6;
/** Lateral offset of the two grid columns from the centreline. */
const GRID_COLUMN = 2;
/** Max random grid jitter per seed: along the track and sideways. */
const GRID_JITTER_ALONG = 0.6;
const GRID_JITTER_SIDE = 0.4;

const NEUTRAL: CarInput = { steer: 0, throttle: false, brake: false };

/**
 * Creates a world at tick 0 (start of the countdown). Cars are staggered in two columns behind
 * the start line, all facing the start heading; the seed nudges each slot slightly.
 */
export function createWorld(trackData: TrackData, options: WorldOptions): World {
  const track = buildTrack(validateTrack(trackData));
  if (!Number.isInteger(options.carCount) || options.carCount < 1) {
    throw new Error('createWorld: carCount must be a positive integer');
  }
  const rng = createRng(options.seed);
  const h = track.layout.startHeading;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const sx = track.xs[0] as number;
  const sz = track.zs[0] as number;
  const cars: CarState[] = [];
  const racers: RacerState[] = [];
  for (let i = 0; i < options.carCount; i++) {
    const back = GRID_FIRST + i * GRID_ROW_GAP + nextRange(rng, -GRID_JITTER_ALONG, GRID_JITTER_ALONG);
    const side = (i % 2 === 0 ? -GRID_COLUMN : GRID_COLUMN) + nextRange(rng, -GRID_JITTER_SIDE, GRID_JITTER_SIDE);
    // Right of the heading is (−fz, fx).
    const car = createCar(track, sx - fx * back - fz * side, sz - fz * back + fx * side, h);
    cars.push(car);
    racers.push(createRacer(car.pos.s, track.length));
  }
  return { track, seed: options.seed, rng, tick: 0, cars, racers };
}

/** Quantises steer exactly as replays store it, so live play and replays are bit-identical. */
export function sanitiseInput(input: CarInput | undefined): CarInput {
  if (input === undefined) return NEUTRAL;
  const raw = Number.isFinite(input.steer) ? Math.max(-1, Math.min(1, input.steer)) : 0;
  // `|| 0` turns −0 into +0, matching what a decoded replay yields.
  const steps = Math.round(raw * 127) || 0;
  return { steer: steps / 127, throttle: input.throttle === true, brake: input.brake === true };
}

/** Advances the world by exactly one tick. `inputs[i]` drives car i (missing = no input). During
 * the countdown inputs are ignored and nothing moves. */
export function stepWorld(world: World, inputs: readonly CarInput[]): void {
  if (world.tick < COUNTDOWN_TICKS) {
    world.tick++;
    return;
  }
  for (let i = 0; i < world.cars.length; i++) {
    stepCar(world.cars[i] as CarState, sanitiseInput(inputs[i]), world.track);
  }
  world.tick++;
  const raceTick = world.tick - COUNTDOWN_TICKS;
  for (let i = 0; i < world.cars.length; i++) {
    const car = world.cars[i] as CarState;
    updateRacer(world.racers[i] as RacerState, car.pos.s, world.track.length, raceTick, world.track.data.laps);
  }
}

/** Views of every car, in car index order (0 = player). */
export function carViews(world: World): CarView[] {
  return world.cars.map((car) => carView(car, world.track));
}

/** Race state for the HUD. */
export function raceView(world: World): RaceView {
  const length = world.track.length;
  const distances = world.racers.map((r, i) => raceDistance(r, (world.cars[i] as CarState).pos.s, length));
  const pos = positions(world.racers, distances);
  return {
    phase: racePhase(world.tick, world.racers[0]),
    countdown: countdownValue(world.tick),
    raceTick: Math.max(0, world.tick - COUNTDOWN_TICKS),
    racers: world.racers.map((r, i) => racerView(r, world.track.data.laps, pos[i] as number)),
  };
}
