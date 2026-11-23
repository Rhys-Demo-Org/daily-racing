// @vitest-environment happy-dom
// R2-1: a card that becomes locked again by the next menu show must not stay checked, and RACE must not start it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, button, card, checked, setup } from '../game/pine-ridge-helpers.ts';

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

describe('R2-1 relocked selection', () => {
  it('a Pine Ridge card locked again on the next menu show is not checked, and RACE does not start it', () => {
    localStorage.setItem('racer.finished.hay-loop', '1');
    const { game, root } = setup();
    card(root, PINE).click();
    expect(checked(root)).toContain(PINE);
    button(root, 'Race').click();
    expect(game.state().trackId).toBe('pine-ridge');
    localStorage.removeItem('racer.finished.hay-loop');
    game.showMenu();
    const pine = card(root, PINE);
    expect(pine.getAttribute('aria-disabled')).toBe('true');
    expect(pine.getAttribute('aria-checked')).not.toBe('true');
    button(root, 'Race').click();
    expect(game.state().trackId).not.toBe('pine-ridge');
  });
});
