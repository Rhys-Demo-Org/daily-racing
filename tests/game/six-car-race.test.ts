// @vitest-environment happy-dom
// B04: a whole six-car race in the running game: every racer finishes, the results table names the
// full roster in sim position order, and the five AI cars finish apart, reproducibly.
// The render layer is stubbed, as in pause-results.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKS } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import type { RaceView } from '../../src/sim/index.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** One fixed seed per race, checked once: its five AI finish ticks are pairwise distinct. */
const SEED = 7;
const FIVE_MINUTES = 5 * 60 * 60;
const NAMES = ['YOU · #1', 'KOSKI · #7', 'BRUNO · #23', 'DEL RIO · #4', 'MAGS · #9', 'OTTO · #12'];

/** Starts a six-car race on a fixed track and seed, plays it with the twin's inputs, then keeps stepping until every
 * racer has finished or five minutes of sim time have passed. */
function playSixCarRace(trackId: string, seed: number): { race: RaceView | null; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  game.startRace({ trackId, seed, carCount: 6 });
  game.play(twinPlayerInputs(trackId, seed, 6, FIVE_MINUTES));
  for (let t = 0; t < FIVE_MINUTES && game.state().race?.racers.some((r) => r.finishTick == null); t += 60) game.step(60);
  return { race: game.state().race, root };
}

describe('B04: six-car race', () => {
  for (const track of TRACKS) {
    it(`AC5: on ${track.id}, all 6 racers finish within 5 minutes and the results table names the roster in position order`, () => {
      const { race, root } = playSixCarRace(track.id, SEED);
      expect(race?.racers).toHaveLength(6);
      for (const r of race?.racers ?? []) {
        expect(r.finishTick).not.toBeNull();
        expect(r.finishTick ?? Infinity).toBeLessThanOrEqual(FIVE_MINUTES);
      }
      const order = [0, 1, 2, 3, 4, 5].sort((a, b) => (race?.racers[a]?.position ?? 0) - (race?.racers[b]?.position ?? 0));
      const table = root.querySelector<HTMLElement>('.ui-results [role="table"][aria-label="Results"]');
      expect(table?.closest<HTMLElement>('.ui-results')?.hidden).toBe(false);
      const rows = [...(table?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])];
      expect(rows).toHaveLength(6);
      expect(rows.map((r) => r.querySelectorAll('[role="cell"]')[1]?.textContent)).toEqual(order.map((i) => NAMES[i]));
    });

    it(`AC6: on ${track.id}, the five AI finish ticks are pairwise distinct and the same on a rerun`, () => {
      const first = playSixCarRace(track.id, SEED).race?.racers.map((r) => r.finishTick) ?? [];
      document.body.replaceChildren();
      const again = playSixCarRace(track.id, SEED).race?.racers.map((r) => r.finishTick) ?? [];
      const ai = first.slice(1);
      expect(ai).toHaveLength(5);
      for (const t of ai) expect(t).not.toBeNull();
      expect(new Set(ai).size).toBe(5);
      expect(again).toEqual(first);
    });
  }
});
