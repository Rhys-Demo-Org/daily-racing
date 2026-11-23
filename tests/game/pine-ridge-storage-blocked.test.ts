// @vitest-environment happy-dom
// B11 · With storage blocked (getItem and setItem throw) the player can still finish on Hay Loop and
// get back to the menu; nothing is saved, so Pine Ridge stays locked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, blockStorage, button, card, cards, finishRace, setup } from './pine-ridge-helpers.ts';

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

const esc = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));

describe('B11 lock with blocked storage', () => {
  it('AC9: finish on Hay Loop and return to the menu without an error; four cards, Pine Ridge still locked', () => {
    blockStorage(true);
    expect(() => window.localStorage.setItem('x', '1')).toThrow();
    const { game, root } = setup();
    expect(() => {
      finishRace(game, 'hay-loop');
      button(root, 'Next race').click();
      esc();
      button(root, 'Quit to menu').click();
    }).not.toThrow();
    expect(game.state().mode).toBe('menu');
    expect(cards(root)).toHaveLength(4);
    expect(card(root, PINE).getAttribute('aria-disabled')).toBe('true');
  });
});
