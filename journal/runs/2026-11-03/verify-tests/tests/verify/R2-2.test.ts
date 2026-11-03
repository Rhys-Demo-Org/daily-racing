// @vitest-environment happy-dom
// R2-2: a startRace() rejected for its car count must not switch the menu track.
import { beforeEach, expect, it, vi } from 'vitest';
import { TRACKS } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

it('R2-2: a startRace with an invalid carCount leaves the menu track unchanged', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  const before = game.state().trackId;
  const other = TRACKS.find((t) => t.id !== before);
  expect(other).toBeDefined();
  expect(() => game.startRace({ trackId: other?.id as string, carCount: 7 })).toThrow();
  expect(game.state().trackId).toBe(before);
});
