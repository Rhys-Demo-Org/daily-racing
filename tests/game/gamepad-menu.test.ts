// @vitest-environment happy-dom
// B06: gamepad A on menus, through a running game. The render layer is stubbed and
// requestAnimationFrame driven by hand (as in pause-results.test.ts); the pad is a mocked
// navigator.getGamepads().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTrackId } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

type Game = ReturnType<typeof createGame>;
type Query = (sel: string) => HTMLElement | null;

let frames: FrameRequestCallback[] = [];
let now = 0;
let held: Record<number, boolean> = {};

function pad(): Gamepad {
  return {
    id: 'test pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held[i] === true, touched: held[i] === true, value: held[i] ? 1 : 0 })),
  } as unknown as Gamepad;
}

beforeEach(() => {
  frames = [];
  now = 0;
  held = {};
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, writable: true, value: () => [pad(), null, null, null] });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'getGamepads');
  document.body.replaceChildren();
});

function runFrames(n: number): void {
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    const queued = frames;
    frames = [];
    for (const cb of queued) cb(now);
  }
}

function setup(): { game: Game; q: Query } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  return { game, q: (sel) => root.querySelector<HTMLElement>(sel) };
}

const A = 0;
const results = (q: Query): HTMLElement | null => q('.ui-results');
const raceButton = (): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Race') && !b.textContent.includes('Next'));

describe('B06: gamepad A on menus', () => {
  it('AC5: A on the start screen starts a six-car race, like tapping RACE', () => {
    const tapped = setup();
    raceButton()?.click();
    const byTap = tapped.game.state();
    document.body.replaceChildren();

    const { game } = setup();
    runFrames(2);
    expect(game.state().mode).toBe('menu');
    held[A] = true;
    runFrames(1);
    const st = game.state();
    expect(st.mode).toBe('race');
    expect(st.cars).toHaveLength(6);
    expect(st).toEqual(byTap);
  });

  it('AC6: A acts only on a fresh press, then activates NEXT RACE on the results screen', () => {
    const { game, q } = setup();
    held[A] = true;
    runFrames(1);
    const start = game.state();
    expect(start.mode).toBe('race');
    // The player drives the whole race (A still held): the race is exactly the twin's, so A added nothing.
    game.freeze();
    game.play(twinPlayerInputs(start.trackId, start.seed, 6, 60 * 60 * 10));
    expect(results(q)?.hidden).toBe(false);
    game.resume();
    // A held since the start screen, across frames on the results screen: nothing.
    runFrames(10);
    expect(game.state()).toMatchObject({ mode: 'race', trackId: start.trackId, seed: start.seed, race: { phase: 'finished' } });
    expect(results(q)?.hidden).toBe(false);

    held[A] = false;
    runFrames(2);
    expect(game.state().trackId).toBe(start.trackId);
    held[A] = true;
    runFrames(1);
    expect(game.state()).toMatchObject({ mode: 'race', trackId: nextTrackId(start.trackId), paused: false, race: { phase: 'countdown', raceTick: 0 } });
    expect(results(q)?.hidden).toBe(true);
    // Holding on into the new race repeats nothing.
    const next = game.state();
    runFrames(5);
    expect(game.state()).toMatchObject({ trackId: next.trackId, seed: next.seed });
  });

  it('AC7: A mid-race does nothing to the car or the game, while the pad still drives', () => {
    const COUNTDOWN_FRAMES = 60 * 4;
    const RACE_FRAMES = 60;
    /** A race started with RACE and run in real frames: no input through the countdown, then `during` held. */
    const race = (during: Record<number, boolean>): ReturnType<Game['state']> => {
      document.body.replaceChildren();
      held = {};
      const { game } = setup();
      raceButton()?.click();
      runFrames(COUNTDOWN_FRAMES);
      expect(game.state().race?.phase).toBe('racing');
      held = during;
      runFrames(RACE_FRAMES);
      return game.state();
    };
    /** The same race with no input at all, stepped to `raceTick`. */
    const idleAt = (raceTick: number): ReturnType<Game['state']> => {
      document.body.replaceChildren();
      held = {};
      const { game } = setup();
      raceButton()?.click();
      game.freeze();
      while (game.state().race?.phase !== 'racing' || (game.state().race?.raceTick ?? 0) < raceTick) game.step(1);
      return game.state();
    };
    const withA = race({ [A]: true });
    expect(withA).toMatchObject({ mode: 'race', paused: false, race: { phase: 'racing' } });
    expect(withA.race?.raceTick).toBeGreaterThan(RACE_FRAMES / 2);
    const idle = idleAt(withA.race?.raceTick ?? 0);
    expect(withA.cars[0]).toEqual(idle.cars[0]);
    expect(withA).toEqual(idle);
    // The pad is live: the right trigger moves the car where A did not.
    const gas = race({ 7: true });
    expect(gas.cars[0]?.speed).toBeGreaterThan((idleAt(gas.race?.raceTick ?? 0).cars[0]?.speed ?? 0) + 1);
  });
});
