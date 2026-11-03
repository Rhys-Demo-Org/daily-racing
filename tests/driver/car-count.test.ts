// The gates' driver can start the grid players get (B04: six cars), so race screenshots and probes
// show what the owner plays; without a car count it keeps the game's default.
import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_CAR_COUNT, ROSTER } from '../../src/content/drivers.ts';
import { installDriver } from '../../src/driver/index.ts';
import type { Game } from '../../src/game.ts';

function fakeGame(calls: unknown[]): Game {
  return { startRace: (o: unknown) => void calls.push(o), state: () => ({}) } as unknown as Game;
}

describe('window.__racer.startRace car count', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('PLAYER_CAR_COUNT is YOU plus every roster AI driver', () => {
    expect(PLAYER_CAR_COUNT).toBe(ROSTER.length);
    expect(PLAYER_CAR_COUNT).toBe(6);
  });

  it('passes carCount through, and leaves it out when not given', () => {
    g.window = {};
    const calls: unknown[] = [];
    const driver = installDriver(fakeGame(calls));
    driver.startRace({ track: 'bends', seed: 3, carCount: PLAYER_CAR_COUNT });
    driver.startRace({ track: 'bends', seed: 3 });
    expect(calls).toEqual([{ trackId: 'bends', seed: 3, carCount: 6 }, { trackId: 'bends', seed: 3 }]);
  });
});
