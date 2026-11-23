// @vitest-environment happy-dom
// B11 · A player finish on Hay Loop is saved at once (racer.finished.hay-loop) and unlocks Pine Ridge
// on the next menu show, without a reload; a finish elsewhere unlocks nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, button, card, checked, finishRace, padlock, setup } from './pine-ridge-helpers.ts';

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
const resultsShowing = (root: HTMLElement): boolean => [...root.querySelectorAll('button')].some((b) => b.textContent?.includes('Next race') && !b.closest('[hidden]'));

describe('B11 unlocking Pine Ridge', () => {
  it('AC6: a Hay Loop finish is in storage while the results screen shows, before any return to the menu', () => {
    const { game, root } = setup();
    expect(localStorage.getItem('racer.finished.hay-loop')).toBeNull();
    finishRace(game, 'hay-loop');
    expect(game.state().mode).toBe('race');
    expect(resultsShowing(root)).toBe(true);
    expect(localStorage.getItem('racer.finished.hay-loop')).not.toBeNull();
  });

  it('AC6: a Dust Bowl finish does not unlock Pine Ridge', () => {
    const { game, root } = setup();
    finishRace(game, 'dust-bowl');
    game.showMenu();
    expect(card(root, PINE).getAttribute('aria-disabled')).toBe('true');
    expect(padlock(card(root, PINE))).not.toBeNull();
  });

  it('AC7: after a Hay Loop finish, NEXT RACE then PAUSE → QUIT TO MENU shows Pine Ridge unlocked, with its best, and RACE starts it', () => {
    localStorage.setItem('racer.bestLap.pine-ridge', '61230');
    const { game, root } = setup();
    expect(card(root, PINE).getAttribute('aria-disabled')).toBe('true');
    finishRace(game, 'hay-loop');
    button(root, 'Next race').click();
    expect(game.state().mode).toBe('race');
    esc();
    expect(game.state().paused).toBe(true);
    button(root, 'Quit to menu').click();
    expect(game.state().mode).toBe('menu');
    const pine = card(root, PINE);
    expect(pine.getAttribute('aria-disabled')).not.toBe('true');
    expect(padlock(pine)).toBeNull();
    expect(pine.textContent).toContain('BEST 1:01.23');
    pine.click();
    expect(checked(root)).toContain(PINE);
    button(root, 'Race').click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'pine-ridge' });
  });

  it('AC7: a new game on the same storage shows Pine Ridge unlocked', () => {
    const first = setup();
    finishRace(first.game, 'hay-loop');
    document.body.replaceChildren();
    const { root } = setup();
    const pine = card(root, PINE);
    expect(pine.getAttribute('aria-disabled')).not.toBe('true');
    expect(padlock(pine)).toBeNull();
  });
});
