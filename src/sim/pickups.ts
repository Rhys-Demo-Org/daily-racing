// Pickups and the boost (opt-in per track: only tracks that declare `pickups` have this state).
//
// Every car collects and fires under the same rules. Driving through a present box while not armed
// takes it (it comes back PICKUP_RESPAWN_TICKS later) and arms that car; an armed car passes through
// boxes without taking them, and when cars reach a box on the same tick the lower car index takes it.
// Firing (CarInput.action) while armed starts a BOOST_TICKS boost for that car only, during which its
// engine reaches BOOST_TOP_SPEED (car.ts). Collecting alone never touches a car.
import type { CarInput, PickupInstance } from './types.ts';

/** A car's centre this close to a box (in units) takes it. */
export const PICKUP_RADIUS = 2.5;
/** Ticks a taken box stays away. */
export const PICKUP_RESPAWN_TICKS = 300;
/** Ticks one boost lasts. */
export const BOOST_TICKS = 90;

export interface PickupState {
  /** Per layout pickup: ticks until the box is back (0 = present). */
  respawn: number[];
  /** Per car: holds a power-up. */
  armed: boolean[];
  /** Per car: ticks of boost left. */
  boostTicks: number[];
  /** Per car: boosting this tick (what stepCars reads; scratch, rewritten every tick). */
  boosting: boolean[];
}

/** State for a track's pickups and `carCount` cars, or undefined if the track has none (the world
 * then has no pickup state). */
export function createPickups(pickups: readonly PickupInstance[], carCount: number): PickupState | undefined {
  if (pickups.length === 0) return undefined;
  const perCar = <T>(v: T): T[] => Array.from({ length: carCount }, () => v);
  return { respawn: pickups.map(() => 0), armed: perCar(false), boostTicks: perCar(0), boosting: perCar(false) };
}

/** Start of a racing tick: timers count down, then every armed car whose input fires does. Returns
 * which cars boost this tick. */
export function beginPickupTick(state: PickupState, inputs: readonly (CarInput | undefined)[]): readonly boolean[] {
  const { respawn, armed, boostTicks, boosting } = state;
  for (let i = 0; i < respawn.length; i++) if ((respawn[i] as number) > 0) respawn[i] = (respawn[i] as number) - 1;
  for (let k = 0; k < armed.length; k++) {
    if ((boostTicks[k] as number) > 0) boostTicks[k] = (boostTicks[k] as number) - 1;
    if (inputs[k]?.action === true && armed[k]) {
      armed[k] = false;
      boostTicks[k] = BOOST_TICKS;
    }
    boosting[k] = (boostTicks[k] as number) > 0;
  }
  return boosting;
}

/** End of a racing tick: in car index order, each unarmed car takes the first present box in reach. */
export function collectPickups(
  state: PickupState,
  pickups: readonly PickupInstance[],
  cars: readonly { readonly x: number; readonly z: number }[],
): void {
  for (let k = 0; k < cars.length; k++) {
    if (state.armed[k]) continue;
    const { x, z } = cars[k] as { x: number; z: number };
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i] as PickupInstance;
      if (state.respawn[i] !== 0 || (p.x - x) ** 2 + (p.z - z) ** 2 > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      state.armed[k] = true;
      state.respawn[i] = PICKUP_RESPAWN_TICKS;
      break;
    }
  }
}
