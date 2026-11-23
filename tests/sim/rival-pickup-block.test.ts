// B13: a box an AI car took is gone for everyone until it respawns 300 ticks later (AC4).
import { describe, expect, it } from 'vitest';
import { trackLayout, type CarInput, type CarView, type PickupInstance, type World } from '../../src/sim/index.ts';
import { carViews, raceView } from '../../src/sim/index.ts';
import { driveToward, dustBowl } from './helpers.ts';
import { aiTakes, near, race } from './rival-helpers.ts';

const boxes = trackLayout(dustBowl).pickups;

describe('B13 AI-taken boxes', () => {
  it('AC4: a box an AI car took stays absent exactly 300 ticks; car 0 driving through it meanwhile stays unarmed', () => {
    // Car 0 waits on the grid until an AI car takes a box, then drives straight through that box
    // and stops once clear of it.
    let target = -1;
    let reached = false;
    let passed = false;
    const drive = (world: World, car: number, bot: CarInput): CarInput => {
      if (car !== 0) return bot;
      const view = raceView(world);
      if (target < 0) {
        target = (view.pickups ?? []).findIndex((present, b) => !present && b < 3);
        if (target < 0) return { steer: 0, throttle: false, brake: true };
      }
      const me = carViews(world)[0] as CarView;
      const box = boxes[target] as PickupInstance;
      passed ||= reached && !near(box, me, 4);
      reached ||= near(box, me);
      if (passed) return { steer: 0, throttle: false, brake: false };
      if (reached) return { steer: 0, throttle: true, brake: false };
      return { steer: driveToward(world, box.x, box.z).steer, throttle: me.speed < 8, brake: false };
    };
    const { log } = race(dustBowl, 7, 1200, drive);
    const take = aiTakes(log, boxes).find((x) => x.box === target);
    expect(take).toBeDefined();
    const { t } = take as { t: number };
    for (let k = 0; k < 300; k++) expect(log[t + k]?.view.pickups?.[target], `+${k}`).toBe(false);
    expect(log[t + 300]?.view.pickups?.[target]).toBe(true);

    let through = 0;
    log.forEach(({ view, cars }, tick) => {
      const me = cars[0] as CarView;
      // Car 0 never comes within reach of a present box, so it is never armed.
      boxes.forEach((p, b) => {
        if (view.pickups?.[b] === true) expect(near(p, me), `tick ${tick} box ${b}`).toBe(false);
      });
      expect(view.racers[0]?.armed, `tick ${tick}`).toBe(false);
      if (near(boxes[target] as PickupInstance, me)) {
        expect(tick).toBeGreaterThan(t);
        expect(tick).toBeLessThan(t + 300);
        expect(view.pickups?.[target]).toBe(false);
        through++;
      }
    });
    expect(through).toBeGreaterThan(0);
  });
});
