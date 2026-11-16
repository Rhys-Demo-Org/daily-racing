// @vitest-environment happy-dom
// Space must still activate the focused menu button (RACE on the start screen): the power-up key
// may not cancel a native button's Space default.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import { createKeyboard } from '../../src/input/keyboard.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const space = (type: string): KeyboardEvent =>
  new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true });

describe('Space on a focused button', () => {
  it('is not cancelled on the start screen RACE button', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createGame(root);
    const button = root.querySelector<HTMLButtonElement>('.ui-screen:not([hidden]) .ui-button--primary');
    expect(button).not.toBeNull();
    button?.focus();
    const down = space('keydown');
    button?.dispatchEvent(down);
    const up = space('keyup');
    button?.dispatchEvent(up);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });

  it('does not fire the power-up, but Space elsewhere still does', () => {
    const button = document.createElement('button');
    document.body.append(button);
    const kb = createKeyboard(window);
    button.dispatchEvent(space('keydown'));
    button.dispatchEvent(space('keyup'));
    expect(kb.actionPressed()).toBe(false);
    const down = space('keydown');
    document.body.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(kb.actionPressed()).toBe(true);
    kb.destroy();
  });
});
