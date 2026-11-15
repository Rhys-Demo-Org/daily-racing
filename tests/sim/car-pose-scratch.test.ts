import { describe, expect, it } from 'vitest';
import type { CarView } from '../../src/sim/types.ts';
import { carView } from '../../src/sim/car.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/race.ts';
import { createWorld, stepWorld } from '../../src/sim/world.ts';
import { createBot } from '../../src/sim/bot.ts';
import { dustBowl } from './helpers.ts';

/** Six bots on Dust Bowl (ramps), stepped `ticks` past the countdown; calls `each` every tick. */
function race(ticks: number, each: (world: ReturnType<typeof createWorld>) => void): void {
  const world = createWorld(dustBowl, { seed: 7, carCount: 6 });
  const bots = world.cars.map((_, i) => createBot(world, i));
  for (let t = 0; t < COUNTDOWN_TICKS + ticks; t++) {
    stepWorld(world, bots.map((b) => b.input(world)));
    each(world);
  }
}

describe('car pose scratch', () => {
  it('computes car views without growing arrays by push (scratch stays allocation-free)', () => {
    let pushes = 0;
    race(600, (world) => {
      const push = Array.prototype.push;
      Array.prototype.push = function (this: unknown[], ...items: unknown[]): number {
        pushes++;
        return push.apply(this, items);
      };
      try {
        for (const car of world.cars) carView(car, world.track);
      } finally {
        Array.prototype.push = push;
      }
    });
    expect(pushes).toBe(0);
  });

  it('a view does not depend on which car was viewed before it', () => {
    race(600, (world) => {
      const first = world.cars.map((c) => carView(c, world.track));
      const reversed = [...world.cars].reverse().map((c) => carView(c, world.track)).reverse();
      expect(reversed as CarView[]).toEqual(first);
    });
  });
});
