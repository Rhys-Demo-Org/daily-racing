// Driver roster (concept frame B): the player and the AI drivers with their liveries, in grid order.
// Data only; the car builder (src/render/car.ts) turns an entry into a mesh. Bodies and stripes are
// palette names, so every livery stays on-palette and passes validateLivery.
import type { CarLivery } from '../render/car.ts';

export interface Driver extends CarLivery {
  /** Shown in caps on results, e.g. "KOSKI · #7". */
  name: string;
}

/** YOU first, then the AI drivers in the order they join a race. */
export const ROSTER: readonly Driver[] = [
  { name: 'YOU', number: 1, body: 'rally-red', stripe: 'cream', player: true },
  { name: 'KOSKI', number: 7, body: 'mustard', stripe: 'navy', player: false },
  { name: 'BRUNO', number: 23, body: 'navy', stripe: 'mustard', player: false },
  { name: 'DEL RIO', number: 4, body: 'teal', stripe: 'cream', player: false },
  { name: 'MAGS', number: 9, body: 'cream', stripe: 'rally-red', player: false },
  { name: 'OTTO', number: 12, body: 'grass', stripe: 'cream', player: false },
];

/** The drivers of an `carCount`-car race: the player (car 0), then the first carCount − 1 AI drivers. */
export function raceDrivers(carCount: number): Driver[] {
  const player = ROSTER.filter((d) => d.player);
  const ai = ROSTER.filter((d) => !d.player);
  if (!Number.isInteger(carCount) || carCount < 1 || carCount > ai.length + 1) {
    throw new Error(`a race has 1..${ai.length + 1} cars, got ${carCount}`);
  }
  return [...player, ...ai.slice(0, carCount - 1)];
}
