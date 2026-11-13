// @vitest-environment happy-dom
// B08 · Racing the selected track: RACE starts a six-car race on the selected card's track, QUIT TO
// MENU comes back with that card selected, and the cards re-read stored bests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

function setup(): { game: ReturnType<typeof createGame>; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  return { game, root };
}

const card = (root: HTMLElement, name: string): HTMLElement | undefined =>
  [...root.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]')].find((c) => c.textContent?.includes(name));
const buttonIn = (el: Element | null, text: string): HTMLButtonElement | undefined =>
  [...(el?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text);
const menuScreen = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('.ui-start');
const esc = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));

/** Pauses the race and presses QUIT TO MENU. */
function quitToMenu(root: HTMLElement): void {
  esc();
  buttonIn(root.querySelector('[role="dialog"][aria-label="Paused"]'), 'Quit to menu')?.click();
}

describe('B08 race the selected track', () => {
  it('AC4: Hay Loop selected + RACE starts a six-car race there; after QUIT TO MENU Hay Loop is still selected and RACE focused', () => {
    const { game, root } = setup();
    const hay = getTrack('hay-loop').name;
    card(root, hay)?.click();
    buttonIn(menuScreen(root), 'Race')?.click();
    const st = game.state();
    expect(st.mode).toBe('race');
    expect(st.trackId).toBe('hay-loop');
    expect(st.race?.racers).toHaveLength(6);
    expect(st.cars).toHaveLength(6);

    game.step(30);
    quitToMenu(root);
    expect(game.state().mode).toBe('menu');
    expect(card(root, hay)?.getAttribute('aria-checked')).toBe('true');
    const checked = root.querySelectorAll('[role="radio"][aria-checked="true"]');
    expect(checked).toHaveLength(1);
    const race = menuScreen(root)?.querySelector('button');
    expect(race?.textContent).toBe('Race');
    expect(race?.classList.contains('ui-button--primary')).toBe(true);
    expect(document.activeElement).toBe(race);
  });

  it('AC5: a stored best that changes during a race shows on its card after QUIT TO MENU', () => {
    const { game, root } = setup();
    const dust = getTrack('dust-bowl').name;
    expect(card(root, dust)?.textContent).toContain('BEST –:––.––');
    card(root, dust)?.click();
    buttonIn(menuScreen(root), 'Race')?.click();
    game.step(30);
    localStorage.setItem('racer.bestLap.dust-bowl', '39990');
    quitToMenu(root);
    expect(card(root, dust)?.textContent).toContain('BEST 0:39.99');
  });
});
