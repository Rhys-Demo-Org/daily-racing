// Race positions: validated race distance and how raceView ranks cars, including two bots racing.
import { describe, expect, it } from 'vitest';
import { createRacer, lapGap, positions, raceDistance, updateRacer } from '../../src/sim/race.ts';
import type { World } from '../../src/sim/world.ts';
import { raceView } from '../../src/sim/world.ts';
import { MAX_TICK_DISPLACEMENT, dustBowl, runBotRace } from './helpers.ts';

const L = 1000;

describe('two bots racing', () => {
  it('both finish, and raceView positions swap exactly when one overtakes the other', () => {
    // Seed 7 gives car 1 (starting behind) the faster bot, so it has to get past car 0.
    // Distance driven along the track, tracked independently of race.ts (the grid is behind the
    // line). The first ticks are the countdown, when nothing moves, so the first call reads the grid.
    let before: number[] | null = null;
    let driven: number[] = [];
    let leader = -1;
    let swaps = 0;
    const { world, seen, finished } = runBotRace(dustBowl, 7, 2, (w: World) => {
      const length = w.track.length;
      before ??= w.cars.map((c) => c.pos.s);
      if (driven.length === 0) driven = before.map((s) => s - length);
      w.cars.forEach((c, i) => {
        driven[i]! += lapGap(before![i]!, c.pos.s, length);
      });
      before = w.cars.map((c) => c.pos.s);
      const view = raceView(w);
      expect(view.racers.map((r) => r.position).sort()).toEqual([1, 2]);
      if (view.racers.every((r) => r.finishTick === null) && Math.abs(driven[0]! - driven[1]!) > 1) {
        expect(view.racers[0]!.position).toBe(driven[0]! > driven[1]! ? 1 : 2);
      }
      const now = view.racers.findIndex((r) => r.position === 1);
      if (leader >= 0 && now !== leader) swaps++;
      leader = now;
    });
    expect(finished).toBe(true);
    expect(swaps).toBeGreaterThan(0);
    // The faster bot won.
    expect(raceView(world).racers.map((r) => r.position)).toEqual([2, 1]);
    expect(seen.maxStep).toBeLessThan(MAX_TICK_DISPLACEMENT);
  });
});

describe('race distance', () => {
  it('reversing back over the line does not inflate race distance or the position', () => {
    // Car a crosses the line to s = 3, then reverses 4 units to s = 999. Car b is 50 units ahead.
    const a = createRacer(L - 10, L);
    const b = createRacer(L - 10, L);
    for (let s = L - 10, t = 1; s <= L + 3; s += 0.5, t++) updateRacer(a, s % L, L, t, 3);
    for (let s = L - 10, t = 1; s <= L + 53; s += 0.5, t++) updateRacer(b, s % L, L, t, 3);
    expect(raceDistance(a, 3, L)).toBe(3);
    let prev = 3;
    for (let s = L + 3; s >= L - 1; s -= 0.5) {
      updateRacer(a, s % L, L, 200, 3);
      const d = raceDistance(a, s % L, L);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
      expect(positions([a, b], [d, raceDistance(b, 53, L)])).toEqual([2, 1]);
    }
  });
});
