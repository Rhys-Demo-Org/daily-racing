import { describe, expect, it } from 'vitest';
import { MAX_TICK_DISPLACEMENT, dustBowl, runAutopilotRace } from './helpers.ts';

describe('autopilot on Dust Bowl', () => {
  for (const seed of [1, 7, 42, 2024, 99991]) {
    it(`finishes 3 laps in the lap-time window without teleports (seed ${seed})`, () => {
      const race = runAutopilotRace(dustBowl, seed);
      expect(race.finished).toBe(true);
      expect(race.lapSeconds).toHaveLength(3);
      for (const lap of race.lapSeconds) {
        expect(lap).toBeGreaterThanOrEqual(38);
        expect(lap).toBeLessThanOrEqual(45);
      }
      expect(race.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
    });
  }

  it('also completes with a full grid of four autopilot cars', () => {
    const race = runAutopilotRace(dustBowl, 5, 4);
    expect(race.finished).toBe(true);
    expect(race.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
  });
});
