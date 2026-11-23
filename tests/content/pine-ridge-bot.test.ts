// B11 · Pine Ridge is raceable: six bots (car 0 included, as the player's stand-in) finish all 3 laps.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { createBot, createWorld, raceView, stepWorld } from '../../src/sim/index.ts';

const MAX_TICKS = 10800;

describe('B11 Pine Ridge bots', () => {
  for (const seed of [1, 2, 3]) {
    it(`AC4: a six-bot race on pine-ridge ends with all six finishing 3 laps within ${MAX_TICKS} ticks (seed ${seed})`, () => {
      const world = createWorld(getTrack('pine-ridge'), { seed, carCount: 6 });
      const bots = Array.from({ length: 6 }, (_, i) => createBot(world, i));
      for (let t = 0; t < MAX_TICKS && raceView(world).racers.some((r) => r.finishTick === null); t++) {
        stepWorld(world, bots.map((b) => b.input(world)));
      }
      const racers = raceView(world).racers;
      expect(racers).toHaveLength(6);
      for (const r of racers) {
        expect(r.finishTick).not.toBeNull();
        expect(r.lapsCompleted).toBe(3);
      }
    });
  }
});
