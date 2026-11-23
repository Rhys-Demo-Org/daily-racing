// B13: bot races on Dust Bowl still finish, and armed rivals use their boost (AC7).
import { describe, expect, it } from 'vitest';
import { dustBowl } from './helpers.ts';
import { aiFires, race } from './rival-helpers.ts';

describe('B13 rival races finish', () => {
  it('AC7: on seeds 1–5 all six cars finish 3 laps within 16200 race ticks, with AI boosts used before the last lap ends', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { log } = race(dustBowl, seed, 16200 + 180);
      const end = (log.at(-1) as (typeof log)[number]).view;
      for (const r of end.racers) {
        expect(r.lapsCompleted, `seed ${seed}`).toBe(3);
        expect(r.finishTick, `seed ${seed}`).not.toBeNull();
        expect(r.finishTick as number, `seed ${seed}`).toBeLessThanOrEqual(16200);
      }
      const fires = aiFires(log);
      expect(fires.length, `seed ${seed}`).toBeGreaterThan(0);
      for (let car = 1; car < 6; car++) {
        // Ticks this car turned armed before starting its last lap.
        log.forEach(({ before, view }, t) => {
          const r = view.racers[car];
          if (before.racers[car]?.armed !== false || r?.armed !== true || r.lapsCompleted >= 2) return;
          const finish = log.findIndex(({ view: v }) => v.racers[car]?.finishTick !== null);
          expect(
            fires.some((f) => f.car === car && f.t > t && f.t <= finish),
            `seed ${seed} car ${car} armed at tick ${t}`,
          ).toBe(true);
        });
      }
    }
  });
});
