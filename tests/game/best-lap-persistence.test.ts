// @vitest-environment happy-dom
// B07: each track's best lap is kept in localStorage under racer.bestLap.<trackId>; the HUD BEST chip
// shows the lower of the stored best and this race's laps. Render stubbed, rAF never run: the race is
// driven through the game's step/play API, as the gates' driver does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import type { CarInput } from '../../src/sim/index.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

const TRACK = 'dust-bowl';
const KEY = 'racer.bestLap.dust-bowl';
const OTHER_KEY = 'racer.bestLap.bends';
const SEED = 5;
const DASHES = '–:––.––';

let inputs: CarInput[] = [];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

const fmt = (ms: number): string => {
  const cs = Math.round(ms / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

function setup(): { game: ReturnType<typeof createGame>; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  return { game, root };
}

/** The HUD BEST chip's value: the text after its "Best" label. */
function bestChip(root: HTMLElement): string {
  const label = [...root.querySelectorAll('span')].find((s) => s.textContent?.trim().toLowerCase() === 'best');
  const chip = label?.parentElement;
  return (chip?.textContent ?? '').replace(/^\s*best/i, '').trim();
}

function visibleNewBest(root: HTMLElement): boolean {
  return [...root.querySelectorAll<HTMLElement>('*')].some((el) => {
    if (!/^new best$/i.test(el.textContent?.trim() ?? '')) return false;
    for (let e: HTMLElement | null = el; e && e !== root; e = e.parentElement) {
      if (e.hidden || e.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  });
}

const playerLaps = (game: ReturnType<typeof createGame>): number[] => game.state().race?.racers[0]?.lapTicks ?? [];

/** Plays the player's inputs tick by tick until `laps` laps are done; returns whether NEW BEST was ever visible. */
function driveLaps(game: ReturnType<typeof createGame>, root: HTMLElement, laps: number): boolean {
  let seen = false;
  for (const input of inputs) {
    if (playerLaps(game).length >= laps) break;
    game.play([input]);
    seen ||= visibleNewBest(root);
  }
  expect(playerLaps(game).length).toBe(laps);
  return seen;
}

describe('B07 best-lap persistence', () => {
  beforeEach(() => {
    if (inputs.length === 0) inputs = twinPlayerInputs(TRACK, SEED, 2, 60 * 60 * 10);
  });

  it('AC1: a stored best for dust-bowl shows in the HUD BEST chip before any lap is completed', () => {
    localStorage.setItem(KEY, '41020');
    const { game, root } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    expect(bestChip(root)).toBe('0:41.02');
    game.step(120);
    expect(playerLaps(game)).toEqual([]);
    expect(bestChip(root)).toBe('0:41.02');
  });

  it.each([
    ['no stored best', null],
    ['a slower stored best', '999999'],
  ])('AC2: with %s, finishing a lap stores it and the next race starts with it', (_, stored) => {
    if (stored !== null) localStorage.setItem(KEY, stored);
    localStorage.setItem(OTHER_KEY, '12345');
    const { game, root } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    driveLaps(game, root, 1);
    const ms = ((playerLaps(game)[0] ?? 0) * 1000) / 60;
    expect(Number(localStorage.getItem(KEY))).toBeCloseTo(ms, 6);
    expect(bestChip(root)).toBe(fmt(ms));
    expect(localStorage.getItem(OTHER_KEY)).toBe('12345');

    game.startRace({ trackId: TRACK, seed: SEED + 1 });
    expect(playerLaps(game)).toEqual([]);
    expect(bestChip(root)).toBe(fmt(ms));
    expect(localStorage.getItem(OTHER_KEY)).toBe('12345');
  });

  it('AC3: a stored best faster than every lap is kept, shown, and no NEW BEST appears', () => {
    localStorage.setItem(KEY, '1000');
    const { game, root } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    const seen = driveLaps(game, root, 2);
    expect(localStorage.getItem(KEY)).toBe('1000');
    expect(bestChip(root)).toBe('0:01.00');
    expect(seen).toBe(false);
  });

  it.each(['abc', '-5', '0'])('AC7: a stored value of "%s" counts as no best', (stored) => {
    localStorage.setItem(KEY, stored);
    const { game, root } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    expect(bestChip(root)).toBe(DASHES);
    expect(driveLaps(game, root, 1)).toBe(true);
    expect(visibleNewBest(root)).toBe(true);
    const ms = ((playerLaps(game)[0] ?? 0) * 1000) / 60;
    expect(Number(localStorage.getItem(KEY))).toBeCloseTo(ms, 6);
    expect(bestChip(root)).toBe(fmt(ms));
  });
});
