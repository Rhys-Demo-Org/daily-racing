// @vitest-environment happy-dom
// B03 in the running game: the results table names the player and the bot from the roster.
// The render layer is stubbed, as in pause-results.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import { createBot, createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const TRACK = 'dust-bowl';
const SEED = 11;

/** The player's inputs for a whole race: the bot driving car 0 in a twin world, until the player finishes. */
function playerInputs(): CarInput[] {
  const world = createWorld(getTrack(TRACK), { seed: SEED, carCount: 2 });
  const bots = [createBot(world, 0), createBot(world, 1)];
  const inputs: CarInput[] = [];
  for (let i = 0; i < 60 * 60 * 10 && world.racers[0]?.finishTick == null; i++) {
    const tickInputs = bots.map((b) => b.input(world));
    inputs.push(tickInputs[0] as CarInput);
    stepWorld(world, tickInputs);
  }
  return inputs;
}

describe('B03: roster names in the game', () => {
  it('AC5: a finished race lists YOU #1 and KOSKI #7 in the results table, in sim position order', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const root = document.createElement('div');
    document.body.append(root);
    const game = createGame(root);
    game.startRace({ trackId: TRACK, seed: SEED });
    game.freeze();
    game.play(playerInputs());
    const race = game.state().race;
    expect(race?.phase).toBe('finished');

    const names = ['YOU · #1', 'KOSKI · #7'];
    const expected = [0, 1].sort((a, b) => (race?.racers[a]?.position ?? 0) - (race?.racers[b]?.position ?? 0)).map((i) => names[i]);
    const table = root.querySelector<HTMLElement>('.ui-results [role="table"][aria-label="Results"]');
    expect(table?.closest<HTMLElement>('.ui-results')?.hidden).toBe(false);
    const drivers = [...(table?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])].map((r) => r.querySelectorAll('[role="cell"]')[1]?.textContent);
    expect(drivers).toEqual(expected);
    expect(table?.textContent).not.toContain('CPU');
  });
});
