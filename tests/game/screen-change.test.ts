// @vitest-environment happy-dom
// B08 · Screen changes: QUIT TO MENU sweeps the triple stripe, RACE / RETRY / NEXT RACE play the
// chequer band. The state changes at once under the overlay, which is gone after 250ms + 2 × 40ms.
// Direct starts (the test driver) and reduced motion get no overlay.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDriver } from '../../src/driver/index.ts';
import { createGame } from '../../src/game.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

const SEED = 5;
const inputs = twinPlayerInputs('dust-bowl', SEED, 2, 60 * 60 * 10);

/** Stubs matchMedia: every query false, except reduced motion when `reduced`. */
function stubMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: reduced && media.includes('prefers-reduced-motion'),
    media,
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  stubMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function setup(): { game: ReturnType<typeof createGame>; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  return { game, root };
}

const buttonIn = (el: Element | null, text: string): HTMLButtonElement | undefined =>
  [...(el?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text);
const change = (root: HTMLElement, kind: string): HTMLElement | null => root.querySelector<HTMLElement>(`[data-screen-change="${kind}"]`);
const anyChange = (root: HTMLElement): Element | null => root.querySelector('[data-screen-change]');
const esc = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));

/** Expects `kind` on show now and gone 330ms later (not before). */
function expectSweep(root: HTMLElement, kind: string): void {
  expect(change(root, kind)).not.toBeNull();
  vi.advanceTimersByTime(329);
  expect(change(root, kind)).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(anyChange(root)).toBeNull();
}

/** Plays a full race to the results screen. */
function toResults(game: ReturnType<typeof createGame>, root: HTMLElement): HTMLElement | null {
  game.startRace({ trackId: 'dust-bowl', seed: SEED });
  game.play(inputs);
  const results = root.querySelector<HTMLElement>('.ui-results');
  expect(results?.hidden).toBe(false);
  return results;
}

describe('B08 screen change', () => {
  it('AC7: QUIT TO MENU shows the menu at once under a three-stripe overlay that is gone 330ms later', () => {
    const { game, root } = setup();
    game.startRace({ seed: 1 });
    game.step(10);
    esc();
    expect(anyChange(root)).toBeNull();
    buttonIn(root.querySelector('[role="dialog"][aria-label="Paused"]'), 'Quit to menu')?.click();
    expect(game.state().mode).toBe('menu');
    expect(root.querySelector<HTMLElement>('.ui-start')?.hidden).toBe(false);
    const overlay = change(root, 'stripes');
    const bands = [...(overlay?.children ?? [])].map((b) => b.className);
    expect(bands).toHaveLength(3);
    for (const colour of ['red', 'mustard', 'cream']) expect(bands.some((b) => b.includes(colour))).toBe(true);
    expectSweep(root, 'stripes');
  });

  it('AC8: a direct game.startRace() adds no overlay; RACE on the menu starts the race under a chequer band gone 330ms later', () => {
    const { game, root } = setup();
    game.startRace({ trackId: 'hay-loop', seed: 2 });
    expect(game.state().mode).toBe('race');
    expect(anyChange(root)).toBeNull();
    game.showMenu();
    expect(anyChange(root)).toBeNull();
    buttonIn(root.querySelector('.ui-start'), 'Race')?.click();
    expect(game.state().mode).toBe('race');
    expectSweep(root, 'chequer');
  });

  it('AC8: RETRY and NEXT RACE on the results screen play the chequer band', () => {
    const { game, root } = setup();
    buttonIn(toResults(game, root), 'Retry')?.click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: 'dust-bowl', race: { phase: 'countdown' } });
    expectSweep(root, 'chequer');

    buttonIn(toResults(game, root), 'Next race')?.click();
    expect(game.state().mode).toBe('race');
    expect(game.state().trackId).not.toBe('dust-bowl');
    expectSweep(root, 'chequer');
  });

  it('starting a race directly (game.startRace or window.__racer.startRace) adds no screen change', () => {
    const { game, root } = setup();
    game.startRace({ trackId: 'hay-loop', seed: 2 });
    expect(anyChange(root)).toBeNull();
    const driver = installDriver(game);
    driver.startRace({ track: 'dust-bowl', seed: 3 });
    expect(anyChange(root)).toBeNull();
    driver.showMenu();
    expect(anyChange(root)).toBeNull();
  });

  it('reduced motion cuts the screen change on RACE and QUIT TO MENU', () => {
    stubMotion(true);
    const { game, root } = setup();
    buttonIn(root.querySelector('.ui-start'), 'Race')?.click();
    expect(game.state().mode).toBe('race');
    expect(anyChange(root)).toBeNull();
    esc();
    buttonIn(root.querySelector('[role="dialog"][aria-label="Paused"]'), 'Quit to menu')?.click();
    expect(game.state().mode).toBe('menu');
    expect(anyChange(root)).toBeNull();
  });
});
