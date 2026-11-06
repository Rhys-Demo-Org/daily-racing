// @vitest-environment happy-dom
// B07: a lap that sets a new stored best shows the HUD NEW BEST chip (slide out, hold 2 s, slide back,
// timed in sim ticks from the motion tokens), and the results chip then reads NEW BEST LAP. Render
// stubbed, rAF never run: the race is driven through the game's step/play API.
import { tokens } from '@tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import { createBot, createWorld, stepWorld, type CarInput } from '../../src/sim/index.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
  playerLivery: (n: number) => ({ body: 'rally-red', stripe: 'cream', number: n, player: true }),
}));

const TRACK = 'dust-bowl';
const KEY = 'racer.bestLap.dust-bowl';
const SEED = 9;
const SLIDE = tokens.motion.durationMs.slide;
const STILL_OUT = Math.ceil(((SLIDE + 2000) * 60) / 1000) - 1;
const GONE = Math.ceil(((2 * SLIDE + 2000) * 60) / 1000);

type Game = ReturnType<typeof createGame>;

/** The player's inputs (a bot driving car 0 of a twin 2-car world) and the player's lap ticks there. */
function twinRace(): { inputs: CarInput[]; lapTicks: number[] } {
  const world = createWorld(getTrack(TRACK), { seed: SEED, carCount: 2 });
  const bots = [createBot(world, 0), createBot(world, 1)];
  const inputs: CarInput[] = [];
  for (let i = 0; i < 60 * 60 * 10 && world.racers[0]?.finishTick == null; i++) {
    const tickInputs = bots.map((b) => b.input(world));
    inputs.push(tickInputs[0] as CarInput);
    stepWorld(world, tickInputs);
  }
  expect(world.racers[0]?.finishTick).not.toBeNull();
  return { inputs, lapTicks: world.racers[0]?.lapTicks.slice() ?? [] };
}

const twin = twinRace();
const ms = (ticks: number): number => (ticks * 1000) / 60;
const fmt = (t: number): string => {
  const cs = Math.round(t / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

function setup(): { game: Game; root: HTMLElement; drive: (n: number) => void; driveToLap: (laps: number) => void } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  game.startRace({ trackId: TRACK, seed: SEED });
  let next = 0;
  const laps = (): number => game.state().race?.racers[0]?.lapTicks.length ?? 0;
  return {
    game,
    root,
    drive(n) {
      game.play(twin.inputs.slice(next, next + n));
      next += n;
    },
    driveToLap(target) {
      while (laps() < target && next < twin.inputs.length) {
        expect(visibleNewBest(root), `NEW BEST visible before lap ${target} ended`).toBe(false);
        game.play([twin.inputs[next++] as CarInput]);
      }
      expect(laps()).toBe(target);
    },
  };
}

function visibleNewBest(root: HTMLElement): boolean {
  return [...root.querySelectorAll<HTMLElement>('*')].some((el) => {
    if (!/^new best$/i.test(el.textContent?.trim() ?? '')) return false;
    for (let e: HTMLElement | null = el; e && e !== root; e = e.parentElement) {
      if (e.hidden || e.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  });
}

const raceTick = (game: Game): number => game.state().race?.raceTick ?? -1;

/** The results screen's best-lap chip: its label and its time. */
function resultsChip(root: HTMLElement): { label: string; time: string } {
  const results = root.querySelector<HTMLElement>('.ui-results');
  expect(results?.hidden).toBe(false);
  const label = [...(results?.querySelectorAll('span') ?? [])].find((s) => /best lap/i.test(s.textContent ?? ''));
  const chip = label?.parentElement;
  return { label: label?.textContent?.trim() ?? '', time: (chip?.textContent ?? '').replace(label?.textContent ?? '', '').trim() };
}

describe('B07 NEW BEST chip', () => {
  it('AC4: a first lap with no stored best shows NEW BEST, held and then hidden on the token timing', () => {
    const { game, root, drive, driveToLap } = setup();
    driveToLap(1);
    const lapEnd = raceTick(game);
    expect(visibleNewBest(root)).toBe(true);
    drive(STILL_OUT);
    expect(raceTick(game)).toBe(lapEnd + STILL_OUT);
    expect(visibleNewBest(root)).toBe(true);
    drive(GONE - STILL_OUT);
    expect(raceTick(game)).toBe(lapEnd + GONE);
    expect(visibleNewBest(root)).toBe(false);
  });

  it('AC4: NEW BEST shows after the best lap only, never after a non-best lap', () => {
    const [l1 = 0, l2 = 0] = twin.lapTicks;
    expect(l1).not.toBe(l2);
    // Stored best between the two laps: the slower is not a new best, the faster is.
    localStorage.setItem(KEY, String((ms(l1) + ms(l2)) / 2));
    const { root, drive, driveToLap } = setup();
    driveToLap(1);
    expect(visibleNewBest(root)).toBe(l1 < l2);
    drive(GONE);
    expect(visibleNewBest(root)).toBe(false);
    // driveToLap asserts the chip stays hidden through lap 2.
    driveToLap(2);
    expect(visibleNewBest(root)).toBe(l2 < l1);
  });

  it('AC4: starting a new race hides a showing NEW BEST chip', () => {
    const { game, root, driveToLap } = setup();
    driveToLap(1);
    expect(visibleNewBest(root)).toBe(true);
    game.startRace({ trackId: TRACK, seed: SEED });
    expect(visibleNewBest(root)).toBe(false);
  });

  it('AC5: after a race that set a new best, the results chip reads NEW BEST LAP with this race’s best lap', () => {
    const { game, root } = setup();
    game.play(twin.inputs);
    expect(game.state().race?.phase).toBe('finished');
    const chip = resultsChip(root);
    expect(chip.label).toMatch(/^new best lap$/i);
    expect(chip.time).toBe(fmt(ms(Math.min(...twin.lapTicks))));
  });

  it('AC5: after a race with no new best, the results chip reads BEST LAP with this race’s best lap', () => {
    localStorage.setItem(KEY, '1000');
    const { game, root } = setup();
    game.play(twin.inputs);
    const chip = resultsChip(root);
    expect(chip.label).toMatch(/^best lap$/i);
    expect(chip.label).not.toMatch(/new/i);
    expect(chip.time).toBe(fmt(ms(Math.min(...twin.lapTicks))));
    // The HUD keeps the faster stored best; the results chip shows this race's.
    const hudBest = [...root.querySelectorAll('span')].find((s) => s.textContent?.trim().toLowerCase() === 'best')?.parentElement;
    expect(hudBest?.textContent).toContain('0:01.00');
  });
});
