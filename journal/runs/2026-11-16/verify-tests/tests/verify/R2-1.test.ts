// @vitest-environment happy-dom
// R2-1: Space must still be able to activate the focused menu button (RACE on the start screen).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('R2-1', () => {
  it('Space on the focused RACE button is not cancelled', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createGame(root);
    const button = root.querySelector<HTMLButtonElement>('.ui-screen:not([hidden]) .ui-button--primary');
    expect(button).not.toBeNull();
    button?.focus();
    const down = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    button?.dispatchEvent(down);
    const up = new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    button?.dispatchEvent(up);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });
});
