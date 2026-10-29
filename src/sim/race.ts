// Race rules: countdown, lap counting with ordered sectors (no shortcut or reverse laps), finish
// and positions.
import type { RacePhase, RacerView } from './types.ts';
import { TICK_HZ } from './types.ts';

/** Countdown length: 3 s at 60 Hz. Cars cannot move until it is over. */
export const COUNTDOWN_TICKS = 3 * TICK_HZ;
/** The lap is split into this many equal-length sectors that must be entered in order. */
export const SECTORS = 8;

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

/** Sector index (0..SECTORS-1) of arc length s on a lap of `lapLength`. */
export function sectorOf(s: number, lapLength: number): number {
  return Math.min(SECTORS - 1, Math.max(0, Math.floor((s / lapLength) * SECTORS)));
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
  const now = sectorOf(s, lapLength);
  const prev = r.sector;
  r.sector = now;
  if (r.finishTick !== null || now === prev) return;
  if (now !== r.expected || prev !== (now + SECTORS - 1) % SECTORS) return;
  r.expected = (now + 1) % SECTORS;
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
 * in order this lap. Progress inside the current sector is capped at the sector's length, so a
 * car that skipped sectors does not gain from it.
 */
export function raceDistance(r: RacerState, s: number, lapLength: number): number {
  if (!r.started) return s - lapLength; // on the grid, behind the line
  const sectorLength = lapLength / SECTORS;
  const last = (r.expected + SECTORS - 1) % SECTORS; // last sector entered in order
  const within = Math.min(sectorLength, Math.max(0, s - last * sectorLength));
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
