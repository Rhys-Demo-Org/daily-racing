// @vitest-environment happy-dom
// B11 · NEXT RACE on the results screen follows the lock: after Dust Bowl it skips the locked Pine
// Ridge for Hay Loop, and goes to Pine Ridge once Hay Loop has been finished.
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
  it('AC8: NEXT RACE after a Dust Bowl finish starts hay-loop with empty storage, and forest-ridge once Hay Loop is finished', () => {
    const { game, root } = setup();
    finishRace(game, 'dust-bowl');
    button(root, 'Next race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'hay-loop' });
    localStorage.setItem('racer.finished.hay-loop', '1');
    finishRace(game, 'dust-bowl');
    button(root, 'Next race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'forest-ridge' });
  });
});
