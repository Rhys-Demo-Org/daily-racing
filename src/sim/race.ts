// Race rules: countdown, lap counting with ordered sectors (no shortcut or reverse laps), finish
// and positions.
import type { RacePhase, RacerView } from './types.ts';
import { TICK_HZ } from './types.ts';

/** Countdown length: 3 s at 60 Hz. Cars cannot move until it is over. */
export const COUNTDOWN_TICKS = 3 * TICK_HZ;
/** Longest a sector may be, in units. */
const MAX_SECTOR_LENGTH = 40;

/** The lap is split into this many equal sectors (at least 8, none longer than 40 units) that must
 * be entered in order, so cutting across one sector boundary can only skip a short stretch. */
export function sectorCount(lapLength: number): number {
  return Math.max(8, Math.ceil(lapLength / MAX_SECTOR_LENGTH));
}

export interface RacerState {
  /** Next sector the car must enter (forward, from the previous one) to make progress. */
  expected: number;
  /** Sector the car was in last tick. */
  sector: number;
  /** False until the car first crosses the line after the start (the grid is behind it). */
  started: boolean;
  lapsCompleted: number;
  lapTicks: number[];
  /** raceTick at the end of the last completed lap (0 = GO). */
  lapStartTick: number;
  finishTick: number | null;
}

/** Signed distance along the lap from arc length a forward to b, in [−lapLength/2, lapLength/2). */
export function lapGap(a: number, b: number, lapLength: number): number {
  return ((b - a + 1.5 * lapLength) % lapLength) - lapLength / 2;
}

/** Sector index (0..sectorCount − 1) of arc length s on a lap of `lapLength`. */
export function sectorOf(s: number, lapLength: number): number {
  const n = sectorCount(lapLength);
  return Math.min(n - 1, Math.max(0, Math.floor((s / lapLength) * n)));
}

/** Racer state for a car standing at arc length s on the grid (behind the line). */
export function createRacer(s: number, lapLength: number): RacerState {
  return {
    expected: 0,
    sector: sectorOf(s, lapLength),
    started: false,
    lapsCompleted: 0,
    lapTicks: [],
    lapStartTick: 0,
    finishTick: null,
  };
}

/**
 * Updates lap state after the car moved to arc length s. A sector only counts when entered
 * forwards from the sector before it, and only if it is the one expected next, so driving
 * backwards over the line, or jumping ahead by cutting across the infield, never earns a lap.
 */
export function updateRacer(r: RacerState, s: number, lapLength: number, raceTick: number, laps: number): void {
  const n = sectorCount(lapLength);
  const now = sectorOf(s, lapLength);
  const prev = r.sector;
  r.sector = now;
  if (r.finishTick !== null || now === prev) return;
  if (now !== r.expected || prev !== (now + n - 1) % n) return;
  r.expected = (now + 1) % n;
  if (now !== 0) return;
  if (!r.started) {
    r.started = true; // first crossing from the grid starts lap 1; the clock started at GO
    return;
  }
  r.lapTicks.push(raceTick - r.lapStartTick);
  r.lapStartTick = raceTick;
  r.lapsCompleted++;
  if (r.lapsCompleted >= laps) r.finishTick = raceTick;
}

/**
 * Validated race distance used for ranking: laps done plus progress through the sectors passed
 * in order this lap. Progress only counts inside the last sector entered in order, so a car that
 * skipped ahead, or reversed back out of it (over the line, say), gains nothing.
 */
export function raceDistance(r: RacerState, s: number, lapLength: number): number {
  if (!r.started) return s - lapLength; // on the grid, behind the line
  const n = sectorCount(lapLength);
  const sectorLength = lapLength / n;
  const last = (r.expected + n - 1) % n; // last sector entered in order
  const within = sectorOf(s, lapLength) === last ? s - last * sectorLength : 0;
  return r.lapsCompleted * lapLength + last * sectorLength + within;
}

/** 1-based positions: finished cars by finish tick, then everyone else by race distance; ties go
 * to the lower car index. */
export function positions(racers: readonly RacerState[], distances: readonly number[]): number[] {
  const order = racers.map((_, i) => i);
  order.sort((a, b) => {
    const ra = racers[a] as RacerState;
    const rb = racers[b] as RacerState;
    if (ra.finishTick !== null || rb.finishTick !== null) {
      if (ra.finishTick === null) return 1;
      if (rb.finishTick === null) return -1;
      if (ra.finishTick !== rb.finishTick) return ra.finishTick - rb.finishTick;
      return a - b;
    }
    const d = (distances[b] as number) - (distances[a] as number);
    return d !== 0 ? d : a - b;
  });
  const result = new Array<number>(racers.length).fill(0);
  order.forEach((car, rank) => {
    result[car] = rank + 1;
  });
  return result;
}

/** View of one racer for the HUD. */
export function racerView(r: RacerState, laps: number, position: number): RacerView {
  return {
    lapsCompleted: r.lapsCompleted,
    lap: Math.min(r.lapsCompleted + 1, laps),
    lapTicks: r.lapTicks.slice(),
    finishTick: r.finishTick,
    position,
  };
}

/** Phase for a world tick: countdown, racing, or finished once the player (car 0) has finished. */
export function racePhase(tick: number, player: RacerState | undefined): RacePhase {
  if (tick < COUNTDOWN_TICKS) return 'countdown';
  return player !== undefined && player.finishTick !== null ? 'finished' : 'racing';
}

/** Whole seconds shown in the countdown: 3, 2, 1, then 0 from GO. */
export function countdownValue(tick: number): number {
  return tick >= COUNTDOWN_TICKS ? 0 : 3 - Math.floor(tick / TICK_HZ);
}
