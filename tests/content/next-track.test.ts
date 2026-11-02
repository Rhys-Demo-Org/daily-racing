import { describe, expect, it } from 'vitest';
import { TRACKS, nextTrackId } from '../../src/content/tracks.ts';

describe('next track', () => {
  it('AC8: nextTrackId returns the following id and wraps; unknown ids throw', () => {
    expect(nextTrackId('a', ['a', 'b', 'c'])).toBe('b');
    expect(nextTrackId('b', ['a', 'b', 'c'])).toBe('c');
    expect(nextTrackId('c', ['a', 'b', 'c'])).toBe('a');
    expect(nextTrackId('solo', ['solo'])).toBe('solo');
    const ids = TRACKS.map((t) => t.id);
    expect(nextTrackId(ids[ids.length - 1] as string)).toBe(ids[0]);
    expect(() => nextTrackId('nope', ['a', 'b'])).toThrow();
    expect(() => nextTrackId('nope')).toThrow();
  });
});
