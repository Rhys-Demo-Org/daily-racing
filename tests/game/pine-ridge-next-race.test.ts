// @vitest-environment happy-dom
// B11 · NEXT RACE on the results screen follows track order: Dust Bowl → Hay Loop, and the Hay Loop
// finish that unlocks Pine Ridge (the fourth, last card) leads to it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, finishRace, setup } from './pine-ridge-helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('B11 NEXT RACE and the lock', () => {
  it('AC8: NEXT RACE after a Dust Bowl finish starts hay-loop, and after the Hay Loop finish that unlocks it, pine-ridge', () => {
    const { game, root } = setup();
    finishRace(game, 'dust-bowl');
    button(root, 'Next race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'hay-loop' });
    finishRace(game, 'hay-loop');
    button(root, 'Next race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'pine-ridge' });
  });
});
