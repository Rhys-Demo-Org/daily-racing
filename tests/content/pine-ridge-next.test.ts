// @vitest-environment happy-dom
// B11 · nextTrackId (no ids) skips locked tracks unless it is the current one; explicit ids are
// unchanged; unreadable storage reads as locked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTrackId } from '../../src/content/tracks.ts';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('B11 next track with locks', () => {
  it('AC8: with empty storage Dust Bowl is followed by Hay Loop, skipping the locked Pine Ridge; once Hay Loop is finished, by Pine Ridge', () => {
    expect(nextTrackId('dust-bowl')).toBe('hay-loop');
    localStorage.setItem('racer.finished.hay-loop', '1');
    expect(nextTrackId('dust-bowl')).toBe('forest-ridge');
  });

  it('AC8: the current track is never skipped, even locked; explicit ids ignore locks', () => {
    expect(nextTrackId('forest-ridge')).toBe('hay-loop');
    expect(nextTrackId('dust-bowl', ['dust-bowl', 'forest-ridge'])).toBe('forest-ridge');
  });

  it('AC8: with getItem throwing Pine Ridge reads as locked', () => {
    localStorage.setItem('racer.finished.hay-loop', '1');
    expect(nextTrackId('dust-bowl')).toBe('forest-ridge');
    const store = window.localStorage;
    // happy-dom caches storage methods once used, so a blocked storage is swapped in whole.
    const blocked = {
      getItem: (): never => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: (k: string, v: string) => store.setItem(k, v),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(blocked);
    expect(nextTrackId('dust-bowl')).toBe('hay-loop');
  });
});
