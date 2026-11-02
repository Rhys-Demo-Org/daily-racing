// @vitest-environment happy-dom
// B01 pause × B02 results: how the pause screen and the results screen interact in a running game.
// The render layer is stubbed and requestAnimationFrame driven by hand, as in pause.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrack, nextTrackId } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import { createBot, createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

type Game = ReturnType<typeof createGame>;
type Query = (sel: string) => HTMLElement | null;

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

const TRACK = 'dust-bowl';
const SEED = 11;

/** The player's inputs for a whole race: the bot driving car 0 in a twin world (same track, seed and
 * 2 cars), up to and including the tick the player finishes. Played into the game, the race is identical. */
function winningInputs(): CarInput[] {
  const world = createWorld(getTrack(TRACK), { seed: SEED, carCount: 2 });
  const bots = [createBot(world, 0), createBot(world, 1)];
  const inputs: CarInput[] = [];
  for (let i = 0; i < 60 * 60 * 10 && world.racers[0]?.finishTick == null; i++) {
    const tickInputs = bots.map((b) => b.input(world));
    inputs.push(tickInputs[0] as CarInput);
    stepWorld(world, tickInputs);
  }
  expect(world.racers[0]?.finishTick).not.toBeNull();
  return inputs;
}

const esc = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
const pauseOverlay = (q: Query): HTMLElement | null => q('[role="dialog"][aria-label="Paused"]')?.closest<HTMLElement>('.ui-layer') ?? null;
const results = (q: Query): HTMLElement | null => q('.ui-results');
const buttonIn = (el: HTMLElement | null, text: string): HTMLButtonElement | undefined =>
  [...(el?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(text));

/** A comparable snapshot of a freshly (re)started race: everything but the seed, plus overlay visibility. */
function freshRace(game: Game, q: Query): unknown {
  const { seed: _seed, ...st } = game.state();
  return { st, pause: pauseOverlay(q)?.hidden, results: results(q)?.hidden };
}

describe('B01 × B02: pause and the results screen', () => {
  const inputs = winningInputs();

  it('once the results screen is showing, Esc and the PAUSE button are ignored', () => {
    const { game, q } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    game.play(inputs);
    expect(game.state().race?.phase).toBe('finished');
    expect(results(q)?.hidden).toBe(false);
    esc();
    q('.ui-hud__tr button[aria-label="Pause"]')?.click();
    runFrames(3);
    expect(game.state().paused).toBe(false);
    expect(pauseOverlay(q)?.hidden).toBe(true);
    expect(results(q)?.hidden).toBe(false);
  });

  it('results never appear while paused: frames step nothing; finishing after resume shows them', () => {
    const { game, q } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    game.play(inputs.slice(0, -1));
    expect(game.state().race?.racers[0]?.finishTick).toBeNull();
    esc();
    expect(game.state().paused).toBe(true);
    runFrames(120);
    expect(game.state().race?.phase).not.toBe('finished');
    expect(results(q)?.hidden).toBe(true);
    esc();
    game.freeze();
    game.play(inputs.slice(-1));
    expect(game.state().race?.phase).toBe('finished');
    expect(results(q)?.hidden).toBe(false);
    expect(pauseOverlay(q)?.hidden).toBe(true);
  });

  it('a driver step that finishes the race while paused swaps the pause screen for the results', () => {
    const { game, q } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    game.freeze();
    game.play(inputs.slice(0, -1));
    esc();
    expect(game.state().paused).toBe(true);
    game.play(inputs.slice(-1));
    expect(game.state().paused).toBe(false);
    expect(pauseOverlay(q)?.hidden).toBe(true);
    expect(results(q)?.hidden).toBe(false);
  });

  it('RESTART RACE from pause and RETRY from results reset exactly the same state', () => {
    const a = setup();
    a.game.startRace({ trackId: TRACK, seed: SEED });
    a.game.play(inputs.slice(0, 600));
    esc();
    buttonIn(pauseOverlay(a.q), 'Restart race')?.click();
    const fromPause = freshRace(a.game, a.q);
    document.body.replaceChildren();

    const b = setup();
    b.game.startRace({ trackId: TRACK, seed: SEED });
    b.game.play(inputs);
    buttonIn(results(b.q), 'Retry')?.click();
    const fromResults = freshRace(b.game, b.q);

    expect(fromResults).toEqual(fromPause);
    expect(fromPause).toMatchObject({ st: { mode: 'race', trackId: TRACK, paused: false, race: { phase: 'countdown', raceTick: 0 } }, pause: true, results: true });
  });

  it('after RETRY the new race can be paused again, and NEXT RACE loads the next track unpaused', () => {
    const { game, q } = setup();
    game.startRace({ trackId: TRACK, seed: SEED });
    game.play(inputs);
    buttonIn(results(q), 'Retry')?.click();
    esc();
    expect(game.state().paused).toBe(true);
    expect(pauseOverlay(q)?.hidden).toBe(false);
    esc();

    game.startRace({ trackId: TRACK, seed: SEED });
    game.play(inputs);
    buttonIn(results(q), 'Next race')?.click();
    expect(game.state()).toMatchObject({ mode: 'race', trackId: nextTrackId(TRACK), paused: false, race: { phase: 'countdown' } });
    expect(results(q)?.hidden).toBe(true);
  });
});
