// @vitest-environment happy-dom
// B07: best-lap storage can be blocked (private tabs, sandboxed frames). The game still reads and
// writes best laps through it, swallows every failure, and the race plays to the results screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

const TRACK = 'dust-bowl';
const SEED = 3;
const inputs = twinPlayerInputs(TRACK, SEED, 2, 60 * 60 * 10);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const fmt = (t: number): string => {
  const cs = Math.round(t / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** Starts a race, drives it to the finish and checks the HUD BEST chip and results screen. */
function raceToFinish(): void {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  game.startRace({ trackId: TRACK, seed: SEED });
  // Lap by lap, so laps are saved (and fail to save) one at a time.
  for (let i = 0; i < inputs.length; i += 600) game.play(inputs.slice(i, i + 600));
  const race = game.state().race;
  expect(race?.phase).toBe('finished');
  const best = fmt((Math.min(...(race?.racers[0]?.lapTicks ?? [])) * 1000) / 60);
  const hudBest = [...root.querySelectorAll('span')].find((s) => s.textContent?.trim().toLowerCase() === 'best')?.parentElement;
  expect(hudBest?.textContent).toContain(best);
  const results = root.querySelector<HTMLElement>('.ui-results');
  expect(results?.hidden).toBe(false);
  expect(results?.textContent).toContain(best);
}

describe('B07 blocked best-lap storage', () => {
  it('AC6: with localStorage getItem/setItem throwing, a race plays to the results screen', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(raceToFinish).not.toThrow();
    // The game did try the store (and survived it).
    expect(get).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
  });

  it('AC6: with reading window.localStorage itself throwing, a race plays to the results screen', () => {
    const access = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(raceToFinish).not.toThrow();
    expect(access).toHaveBeenCalled();
  });
});
