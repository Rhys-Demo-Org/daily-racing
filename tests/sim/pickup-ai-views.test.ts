// B12 pickups: AI racer views never carry the player's pickup state (AC2), even while the player is
// armed or boosting.
import { describe, expect, it } from 'vitest';
import { createBot, createWorld, raceView, stepWorld, type CarInput } from '../../src/sim/index.ts';
import { dustBowl } from './helpers.ts';

describe('B12 pickups: AI racer views', () => {
  it('AC2: while the player is armed and then boosting, every AI racer view shows armed false and boostTicks 0', () => {
    const world = createWorld(dustBowl, { seed: 3, carCount: 3 });
    const bots = world.cars.map((_, i) => createBot(world, i));
    let armedTicks = 0;
    let boostTicks = 0;
    let fired = false;
    for (let t = 0; t < 1500; t++) {
      const before = raceView(world);
      const inputs: CarInput[] = bots.map((b) => b.input(world));
      // Hold the armed state for a while before firing, so both states are seen with AI on track.
      if (!fired && before.racers[0]?.armed === true && armedTicks >= 30) {
        (inputs[0] as CarInput).action = true;
        fired = true;
      }
      stepWorld(world, inputs);
      const view = raceView(world);
      if (view.racers[0]?.armed === true) armedTicks++;
      if ((view.racers[0]?.boostTicks ?? 0) > 0) boostTicks++;
      for (const r of view.racers.slice(1)) {
        expect(r.armed, `tick ${t}`).toBe(false);
        expect(r.boostTicks, `tick ${t}`).toBe(0);
      }
    }
    expect(fired).toBe(true);
    expect(armedTicks).toBeGreaterThan(0);
    expect(boostTicks).toBeGreaterThan(0);
  });
});
