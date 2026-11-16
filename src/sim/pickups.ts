// Pickups and the boost (opt-in per track: only tracks that declare `pickups` have this state).
//
// Only the player (car 0) collects and fires. Driving through a present box while not armed takes it
// (it comes back PICKUP_RESPAWN_TICKS later) and arms the player; an armed player passes through
// boxes without taking them. Firing (CarInput.action) while armed starts a BOOST_TICKS boost, during
// which the car's engine reaches BOOST_TOP_SPEED (car.ts). Collecting alone never touches a car.
import type { PickupInstance } from './types.ts';

/** A car's centre this close to a box (in units) takes it. */
export const PICKUP_RADIUS = 2.5;
/** Ticks a taken box stays away. */
export const PICKUP_RESPAWN_TICKS = 300;
/** Ticks one boost lasts. */
export const BOOST_TICKS = 90;

export interface PickupState {
  /** Per layout pickup: ticks until the box is back (0 = present). */
  respawn: number[];
  /** The player holds a power-up. */
  armed: boolean;
  /** Ticks of boost left for the player. */
  boostTicks: number;
}

/** State for a track's pickups, or undefined if it has none (the world then has no pickup state). */
export function createPickups(pickups: readonly PickupInstance[]): PickupState | undefined {
  return pickups.length === 0 ? undefined : { respawn: pickups.map(() => 0), armed: false, boostTicks: 0 };
}

/** Start of a racing tick: timers count down, then the player fires if armed. Returns whether the
 * player boosts this tick. */
export function beginPickupTick(state: PickupState, fire: boolean): boolean {
  const { respawn } = state;
  for (let i = 0; i < respawn.length; i++) if ((respawn[i] as number) > 0) respawn[i] = (respawn[i] as number) - 1;
  if (state.boostTicks > 0) state.boostTicks--;
  if (fire && state.armed) {
    state.armed = false;
    state.boostTicks = BOOST_TICKS;
  }
  return state.boostTicks > 0;
}

/** End of a racing tick: the player at (x, z) takes the first present box in reach, unless armed. */
export function collectPickups(state: PickupState, pickups: readonly PickupInstance[], x: number, z: number): void {
  if (state.armed) return;
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i] as PickupInstance;
    if (state.respawn[i] !== 0 || (p.x - x) ** 2 + (p.z - z) ** 2 > PICKUP_RADIUS * PICKUP_RADIUS) continue;
    state.armed = true;
    state.respawn[i] = PICKUP_RESPAWN_TICKS;
    return;
  }
}
