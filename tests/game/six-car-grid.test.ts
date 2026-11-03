// @vitest-environment happy-dom
// B04: races the player starts have six cars on a staggered grid, with POS x/6 and six minimap dots.
// The render layer is stubbed, as in pause-results.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKS } from '../../src/content/tracks.ts';
import { createGame } from '../../src/game.ts';
import { CAR_WIDTH, COUNTDOWN_TICKS, createWorld } from '../../src/sim/index.ts';
import { twinPlayerInputs } from './helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

type Game = ReturnType<typeof createGame>;
type Query = (sel: string) => HTMLElement | null;

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function setup(): { game: Game; q: Query; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const game = createGame(root);
  game.freeze();
  return { game, root, q: (sel) => root.querySelector<HTMLElement>(sel) };
}

const buttonIn = (el: Element | null | undefined, text: string): HTMLButtonElement | undefined =>
  [...(el?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim().toLowerCase().startsWith(text.toLowerCase()));

/** Presses RACE on the start screen. */
function pressRace(q: Query): void {
  const race = buttonIn(q('.menu-layer'), 'Race');
  expect(race).toBeDefined();
  race?.click();
}

const posOf = (q: Query): string | null | undefined => q('.ui-hud-pos__of')?.textContent;

const TEN_MINUTES = 60 * 60 * 10;

describe('B04: six-car grid', () => {
  it('AC1: pressing RACE starts a race with 6 cars and 6 racers', () => {
    const { game, q } = setup();
    pressRace(q);
    const st = game.state();
    expect(st.mode).toBe('race');
    expect(st.cars).toHaveLength(6);
    expect(st.race?.racers).toHaveLength(6);
  });

  it('AC1: on every track and seeds 1-20 the six-car grid is on dirt, spread out, behind the line and clear of props', () => {
    expect(TRACKS.length).toBeGreaterThan(0);
    for (const track of TRACKS) {
      for (let seed = 1; seed <= 20; seed++) {
        const world = createWorld(track, { seed, carCount: 6 });
        expect(world.cars).toHaveLength(6);
        const h = world.track.layout.startHeading;
        const fx = Math.sin(h);
        const fz = -Math.cos(h);
        const sx = world.track.xs[0] as number;
        const sz = world.track.zs[0] as number;
        let lastAlong = 0;
        world.cars.forEach((car, i) => {
          expect(car.surface).toBe('dirt');
          const along = (car.x - sx) * fx + (car.z - sz) * fz;
          expect(along).toBeLessThan(0);
          expect(along).toBeLessThan(lastAlong);
          lastAlong = along;
          for (let j = 0; j < i; j++) {
            const other = world.cars[j];
            expect(Math.hypot((other?.x ?? 0) - car.x, (other?.z ?? 0) - car.z)).toBeGreaterThanOrEqual(4);
          }
          // Slots 0-3 are the grid older races already use; the new last row must sit wholly on the
          // road and start clear of props.
          if (i >= 4) {
            expect(Math.abs(car.pos.lateral) + CAR_WIDTH / 2).toBeLessThan(world.track.halfWidth);
            for (const c of world.track.colliders) expect(Math.hypot(c.x - car.x, c.z - car.z) - c.bound).toBeGreaterThan(3);
          }
        });
      }
    }
  });

  it('AC2: the POS readout shows a denominator of 6, 1/6 before GO', () => {
    const { game, q } = setup();
    pressRace(q);
    expect(game.state().race?.phase).toBe('countdown');
    expect(q('.ui-hud-pos__value')?.textContent).toBe('1/6');
    expect(posOf(q)).toBe('/6');
  });

  it('AC3: the minimap has 6 dots in the six body colours, the larger rally-red player dot drawn last', () => {
    const { game, q } = setup();
    pressRace(q);
    game.step(COUNTDOWN_TICKS + 60);
    const dots = [...(q('svg[aria-label="Track map"]')?.querySelectorAll('circle') ?? [])];
    expect(dots).toHaveLength(6);
    const colours = dots.map((d) => [...d.classList].find((c) => c.startsWith('ui-hud-map__car--'))?.slice('ui-hud-map__car--'.length));
    expect([...colours].sort()).toEqual(['cream', 'grass', 'mustard', 'navy', 'rally-red', 'teal']);
    expect(colours[5]).toBe('rally-red');
    const radius = (d: Element | undefined): number => Number(d?.getAttribute('r'));
    for (const d of dots.slice(0, 5)) expect(radius(dots[5])).toBeGreaterThan(radius(d));
  });

  it('AC4: with no player input, each AI car is more than 20 units from its grid slot 5 s after GO', () => {
    const { game, q } = setup();
    pressRace(q);
    const grid = game.state().cars;
    game.step(COUNTDOWN_TICKS + 5 * 60);
    const cars = game.state().cars;
    expect(cars).toHaveLength(6);
    for (let i = 1; i <= 5; i++) {
      const a = grid[i];
      const b = cars[i];
      expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.z ?? 0) - (a?.z ?? 0))).toBeGreaterThan(20);
    }
  });

  it('AC7: RETRY, RESTART RACE and NEXT RACE from a six-car race each start a six-car race', () => {
    const { game, q } = setup();
    pressRace(q);
    const track = game.state().trackId;
    game.play(twinPlayerInputs(track, game.state().seed, 6, TEN_MINUTES));
    expect(game.state().race?.phase).toBe('finished');

    buttonIn(q('.ui-results'), 'Retry')?.click();
    expect(game.state().race?.phase).toBe('countdown');
    expect(game.state().cars).toHaveLength(6);
    expect(game.state().race?.racers).toHaveLength(6);
    expect(posOf(q)).toBe('/6');

    game.step(COUNTDOWN_TICKS + 30);
    q('.ui-hud__tr button[aria-label="Pause"]')?.click();
    expect(game.state().paused).toBe(true);
    const tickBefore = game.state().race?.raceTick;
    buttonIn(q('[role="dialog"][aria-label="Paused"]'), 'Restart race')?.click();
    expect(game.state().paused).toBe(false);
    expect(tickBefore).toBeGreaterThan(0);
    expect(game.state().race?.phase).toBe('countdown');
    expect(game.state().cars).toHaveLength(6);
    expect(posOf(q)).toBe('/6');

    game.play(twinPlayerInputs(game.state().trackId, game.state().seed, 6, TEN_MINUTES));
    expect(game.state().race?.phase).toBe('finished');
    buttonIn(q('.ui-results'), 'Next race')?.click();
    expect(game.state().race?.phase).toBe('countdown');
    expect(game.state().cars).toHaveLength(6);
    expect(game.state().race?.racers).toHaveLength(6);
    expect(posOf(q)).toBe('/6');
  });
});
