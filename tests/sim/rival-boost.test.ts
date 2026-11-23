// B13 rivals boost: an AI car's fired power-up boosts that car only (AC2, AC3).
import { describe, expect, it } from 'vitest';
import type { CarInput } from '../../src/sim/index.ts';
import { dustBowl } from './helpers.ts';
import { aiFires, race } from './rival-helpers.ts';

describe('B13 rivals boost', () => {
  it('AC2: an AI fire shows boostTicks 90 then counts down to 0, faster than 25 and never above 32; car 0 never fires', () => {
    const { log } = race(dustBowl, 7, 4000);
    const fires = aiFires(log);
    expect(fires.length).toBeGreaterThan(0);
    for (const { t, car } of fires) {
      const at = `car ${car} fired at tick ${t}`;
      expect(log[t]?.view.racers[car]?.boostTicks, at).toBe(90);
      expect(log[t]?.view.racers[car]?.armed, at).toBe(false);
      let top = 0;
      for (let k = 0; k <= 90 && t + k < log.length; k++) {
        const tick = log[t + k] as (typeof log)[number];
        expect(tick.view.racers[car]?.boostTicks, `${at}, +${k}`).toBe(90 - k);
        const speed = tick.cars[car]?.speed ?? NaN;
        expect(speed, `${at}, +${k}`).toBeLessThanOrEqual(32);
        top = Math.max(top, speed);
      }
      expect(top, at).toBeGreaterThan(25);
    }
    for (const { inputs, view } of log) {
      expect(inputs[0]?.action).toBeUndefined();
      expect(view.racers[0]?.boostTicks).toBe(0);
    }
  });

  it('AC3: the test fires car 1 once while armed: car 1 boosts, car 0 is unchanged over the boost', () => {
    // Car 1 runs on its bot's steering and pedals but never fires on its own.
    const quiet = (fireAt: number) => (_w: unknown, car: number, bot: CarInput, t: number): CarInput => {
      if (car !== 1) return bot;
      const { action: _fire, ...rest } = bot;
      return t === fireAt ? { ...rest, action: true } : rest;
    };
    const base = race(dustBowl, 7, 2400, quiet(-1)).log;
    // First tick car 1 is armed, on a long straight (where its bot would fire).
    const fireAt = race(dustBowl, 7, 2400).log.findIndex(({ inputs, before }) => inputs[1]?.action === true && before.racers[1]?.armed === true);
    expect(fireAt).toBeGreaterThan(0);
    expect(base[fireAt]?.before.racers[1]?.armed).toBe(true);
    const fired = race(dustBowl, 7, 2400, quiet(fireAt)).log;
    expect(fired[fireAt]?.inputs[1]?.action).toBe(true);
    expect(fired[fireAt]?.view.racers[1]).toMatchObject({ armed: false, boostTicks: 90 });
    expect(base[fireAt]?.view.racers[1]).toMatchObject({ armed: true, boostTicks: 0 });
    for (let t = 0; t <= fireAt + 90; t++) {
      const a = fired[t]?.view.racers[0];
      const b = base[t]?.view.racers[0];
      expect({ armed: a?.armed, boostTicks: a?.boostTicks }, `tick ${t}`).toEqual({ armed: b?.armed, boostTicks: b?.boostTicks });
      expect(a?.boostTicks).toBe(0);
    }
  });
});
