// B10: the bot laps Hay Loop in about 52 s, cleanly, alone and in six-car races.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { BOT_TUNING } from '../../src/sim/bot.ts';
import { runBotRace } from '../sim/helpers.ts';

const FIVE_MINUTES = 5 * 60 * 60;

describe('B10: bots on Hay Loop', () => {
  it('AC4: a single bot finishes 3 clean laps on seeds 1, 2, 3, 42 and 1234, median lap 48-56 s', () => {
    const laps: number[] = [];
    for (const seed of [1, 2, 3, 42, 1234]) {
      // One run per seed serves every check.
      const { finished, lapSeconds, seen } = runBotRace(getTrack('hay-loop'), seed, 1);
      expect(finished, `seed ${seed}`).toBe(true);
      expect(lapSeconds[0], `seed ${seed}`).toHaveLength(3);
      expect(seen.grassTicks, `seed ${seed}`).toBe(0);
      expect(seen.propTicks, `seed ${seed}`).toBe(0);
      expect(seen.maxSlowTicks, `seed ${seed}`).toBeLessThan(BOT_TUNING.stuckTicks);
      laps.push(...(lapSeconds[0] ?? []));
    }
    expect(laps).toHaveLength(15);
    const median = [...laps].sort((a, b) => a - b)[7] as number;
    expect(median).toBeGreaterThanOrEqual(48);
    expect(median).toBeLessThanOrEqual(56);
  });

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`AC5: six bots all finish 3 laps within 5 minutes, never stuck (seed ${seed})`, () => {
      const { finished, world, seen } = runBotRace(getTrack('hay-loop'), seed, 6, undefined, FIVE_MINUTES);
      expect(finished).toBe(true);
      for (const r of world.racers) {
        expect(r.lapTicks).toHaveLength(3);
        expect(r.finishTick ?? Infinity).toBeLessThanOrEqual(FIVE_MINUTES);
      }
      expect(seen.maxSlowTicks).toBeLessThan(BOT_TUNING.stuckTicks);
    });
  }
});
