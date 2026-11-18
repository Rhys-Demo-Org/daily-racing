// Test-only helpers for the B11 Pine Ridge lock suites: a game with hand-driven frames, the track
// select's cards and buttons by role and text, finishing a race as the player, and blocked storage.
import { expect, vi } from 'vitest';
import { createGame, type Game } from '../../src/game.ts';
import { twinPlayerInputs } from './helpers.ts';

export const PINE = 'Pine Ridge';

export function setup(): { game: Game; root: HTMLElement } {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const root = document.createElement('div');
  document.body.append(root);
  return { game: createGame(root), root };
}

export const cards = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>('[role="radiogroup"][aria-label="Select track"] [role="radio"]'),
];
export const card = (root: HTMLElement, name: string): HTMLElement => {
  const found = cards(root).find((c) => c.textContent?.includes(name));
  if (!found) throw new Error(`no card ${name}`);
  return found;
};
export const checked = (root: HTMLElement): string | undefined => cards(root).find((c) => c.getAttribute('aria-checked') === 'true')?.textContent ?? undefined;
export const padlock = (el: HTMLElement): Element | null => el.querySelector('[role="img"][aria-label="Locked"]');

/** The visible button whose text includes `text` (results, pause card or the menu). */
export function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text) && !b.closest('[hidden]'));
  if (!found) throw new Error(`no visible button ${text}`);
  return found;
}

/** Starts a two-car race on `trackId` and plays the player (car 0) to the finish. */
export function finishRace(game: Game, trackId: string, seed = 3): void {
  const inputs = twinPlayerInputs(trackId, seed, 2, 60 * 60 * 10);
  game.startRace({ trackId, seed, carCount: 2 });
  game.play(inputs);
  expect(game.state().race?.racers[0]?.finishTick).not.toBeNull();
}

/** localStorage whose getItem (and, with `writes`, setItem) throw. happy-dom caches storage methods
 * once used, so the whole object is swapped in through the window getter. */
export function blockStorage(writes: boolean): void {
  const store = window.localStorage;
  const blocked = (): never => {
    throw new DOMException('blocked', 'SecurityError');
  };
  const fake = {
    getItem: blocked,
    setItem: writes ? blocked : (k: string, v: string) => store.setItem(k, v),
    removeItem: blocked,
    clear: blocked,
    key: blocked,
    length: 0,
  } as unknown as Storage;
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue(fake);
}
