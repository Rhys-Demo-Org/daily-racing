// Test-only helpers for the game suites.
import { expect } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';
import { botsFor } from '../sim/helpers.ts';

/** The player's inputs for a whole race: a bot driving car 0 of a twin world with `carCount` cars, stepped until
 * car 0 finishes (which it must within `maxTicks`). */
export function twinPlayerInputs(trackId: string, seed: number, carCount: number, maxTicks: number): CarInput[] {
  const world = createWorld(getTrack(trackId), { seed, carCount });
  const bots = botsFor(world);
  const inputs: CarInput[] = [];
  for (let i = 0; i < maxTicks && world.racers[0]?.finishTick == null; i++) {
    const tickInputs = bots.map((b) => b.input(world));
    inputs.push(tickInputs[0] as CarInput);
    stepWorld(world, tickInputs);
  }
  expect(world.racers[0]?.finishTick).not.toBeNull();
  return inputs;
}
