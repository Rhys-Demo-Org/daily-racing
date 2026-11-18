// @vitest-environment happy-dom
// B11 · Returning to the menu from a race on a track that unlocked after the menu last showed: the
// menu re-reads the lock when it selects that track, so Pine Ridge stays selected and RACE starts it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, button, checked, finishRace, setup } from './pine-ridge-helpers.ts';

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

describe('B11 menu return after an unlock', () => {
  it('AC7: quitting a Pine Ridge race reached via NEXT RACE, with no menu show since the unlock, leaves Pine Ridge selected', () => {
    const { game, root } = setup();
    finishRace(game, 'hay-loop');
    finishRace(game, 'dust-bowl');
    button(root, 'Next race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'forest-ridge' });
    esc();
    expect(game.state().paused).toBe(true);
    button(root, 'Quit to menu').click();
    expect(game.state().mode).toBe('menu');
    expect(checked(root)).toContain(PINE);
    button(root, 'Race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'forest-ridge' });
  });
});
