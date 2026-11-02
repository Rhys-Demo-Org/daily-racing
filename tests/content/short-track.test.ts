// Bramble Bends: a short, twisty two-lap track that the menu loads first, so a whole race (and the
// results screen after it) takes about half a minute to play.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS, getTrack } from '../../src/content/tracks.ts';
import { validateTrack } from '../../src/sim/track.ts';
import { runBotRace } from '../sim/helpers.ts';

describe('short test track', () => {
  it('validates, is registered first and has 2 laps', () => {
    const raw: unknown = JSON.parse(readFileSync('src/content/tracks/bends.json', 'utf8'));
    expect(validateTrack(raw).id).toBe('bends');
    expect(TRACKS[0]?.id).toBe('bends');
    expect(getTrack('bends').name).toBe('Bramble Bends');
    expect(getTrack('bends').laps).toBe(2);
  });

  for (const seed of [1, 2, 42]) {
    it(`a bot finishes both laps in under 36 s, each lap 12-18 s, on the dirt (seed ${seed})`, () => {
      const { lapSeconds, finished, seen } = runBotRace(getTrack('bends'), seed, 2);
      expect(finished).toBe(true);
      const laps = lapSeconds[0]!;
      expect(laps).toHaveLength(2);
      for (const lap of laps) {
        expect(lap).toBeGreaterThan(12);
        expect(lap).toBeLessThan(18);
      }
      expect(laps[0]! + laps[1]!).toBeLessThan(36);
      expect(seen.grassTicks).toBe(0);
    });
  }
});
