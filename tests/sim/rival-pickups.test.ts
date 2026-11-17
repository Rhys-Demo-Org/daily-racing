// B13 rivals use pickups: AI cars take boxes (AC1), armed AI cars leave them (AC5), and only
// pickup tracks see AI actions (AC8).
import { describe, expect, it } from 'vitest';
import { trackLayout, type CarView, type TrackData } from '../../src/sim/index.ts';
import { dustBowl, TRACKS } from './helpers.ts';
import { aiTakes, near, race } from './rival-helpers.ts';

const boxes = trackLayout(dustBowl).pickups;

describe('B13 rivals take boxes', () => {
  it('AC1: an AI car turns armed, and on that tick a box within 2.5 units of it turns absent', () => {
    const { log } = race(dustBowl, 7, 4000);
    const takes = aiTakes(log, boxes);
    expect(takes.length).toBeGreaterThan(0);
    for (const take of takes) expect(take.box, `car ${take.car} at tick ${take.t}`).toBeGreaterThanOrEqual(0);
  });

  it('AC5: an armed AI car alone within 2.5 units of a present box leaves it there and stays armed', () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      const { log } = race(dustBowl, seed, 4000);
      for (let t = 0; t + 1 < log.length; t++) {
        const { view, cars } = log[t] as (typeof log)[number];
        const next = log[t + 1] as (typeof log)[number];
        boxes.forEach((p, b) => {
          if (view.pickups?.[b] !== true) return;
          const unarmedNear = view.racers.some((r, i) => r.armed === false && near(p, cars[i] as CarView));
          if (unarmedNear) return;
          for (let i = 1; i < view.racers.length; i++) {
            if (view.racers[i]?.armed !== true || !near(p, cars[i] as CarView)) continue;
            checked++;
            expect(next.view.pickups?.[b], `seed ${seed} tick ${t} box ${b}`).toBe(true);
            expect(next.view.racers[i]?.armed, `seed ${seed} tick ${t} car ${i}`).toBe(true);
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('AC8: AI bots fire only on Dust Bowl; Bramble Bends and Hay Loop racer views have no pickup keys', () => {
    for (const name of ['Bramble Bends', 'Hay Loop']) {
      const track = TRACKS.find((t) => t.name === name) as TrackData;
      const { log } = race(track, 3, 3000);
      for (const { inputs, view } of log) {
        for (let i = 1; i < inputs.length; i++) expect(inputs[i]?.action, name).toBeUndefined();
        for (const r of view.racers) {
          expect('armed' in r, name).toBe(false);
          expect('boostTicks' in r, name).toBe(false);
        }
      }
    }
    const { log } = race(dustBowl, 3, 3000);
    expect(log.some(({ inputs }) => inputs.slice(1).some((input) => input.action === true))).toBe(true);
  });
});
