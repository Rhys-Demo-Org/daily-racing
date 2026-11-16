// @vitest-environment happy-dom
// R2-2: a Space tap made while paused must not fire the boost on the first tick after resume.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/game.ts';
import { PLAYER_CAR_COUNT } from '../../src/content/drivers.ts';
import { getTrack } from '../../src/content/tracks.ts';
import { createWorld, stepWorld, raceView } from '../../src/sim/index.ts';
import { botsFor } from '../sim/helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

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
const key = (type: string, code: string): boolean =>
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));

describe('pause and the power-up', () => {
  it('Space pressed on the pause screen does not fire the power-up after resume', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const game = createGame(root);
    game.startRace({ trackId: 'dust-bowl', seed: 1, carCount: PLAYER_CAR_COUNT });
    // Drive car 0 with the bot (twin world) until it holds a power-up.
    const world = createWorld(getTrack('dust-bowl'), { seed: 1, carCount: PLAYER_CAR_COUNT });
    const bots = botsFor(world);
    for (let i = 0; i < 6000 && raceView(world).racers[0]?.armed !== true; i++) {
      const inputs = bots.map((b) => b.input(world));
      game.play([inputs[0] as (typeof inputs)[number]]);
      stepWorld(world, inputs);
    }
    expect(game.state().race?.racers[0]?.armed).toBe(true);
    runFrames(1); // loop is running
    expect(game.state().race?.racers[0]?.armed).toBe(true);

    key('keydown', 'Escape');
    expect(game.state().paused).toBe(true);
    key('keydown', 'Space');
    key('keyup', 'Space');
    key('keydown', 'Escape');
    expect(game.state().paused).toBe(false);
    runFrames(3);
    expect(game.state().race?.racers[0]?.boostTicks).toBe(0);
    expect(game.state().race?.racers[0]?.armed).toBe(true);
  });
});
