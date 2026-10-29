import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS, getTrack } from '../../src/content/tracks.ts';

describe('track registry', () => {
  it('registers every JSON file in src/content/tracks', () => {
    const files = readdirSync('src/content/tracks').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
    expect(TRACKS.map((t) => t.id)).toEqual(files);
  });

  it('has nothing but track JSON in the tracks folder', () => {
    expect(readdirSync('src/content/tracks').every((f) => f.endsWith('.json'))).toBe(true);
  });

  it('includes Dust Bowl', () => {
    expect(getTrack('dust-bowl').name).toBe('Dust Bowl');
    expect(() => getTrack('nope')).toThrow();
  });
});
