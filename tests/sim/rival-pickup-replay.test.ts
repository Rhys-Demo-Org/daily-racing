// B13: races with AI boosts replay exactly and are deterministic (AC6).
import { describe, expect, it } from 'vitest';
import { carViews, createReplay, decodeReplay, encodeReplay, replayInputs, runReplay, type CarInput } from '../../src/sim/index.ts';
import { dustBowl } from './helpers.ts';
import { aiFires, race } from './rival-helpers.ts';

describe('B13 rival pickup replays', () => {
  it('AC6: a recorded six-car Dust Bowl race with AI boosts replays exactly; same seed and player inputs give the same RaceViews', () => {
    const live = race(dustBowl, 11, 3000);
    const fires = aiFires(live.log);
    expect(fires.length).toBeGreaterThan(0);
    // The fire really produced a boost.
    const first = fires[0] as { t: number; car: number };
    expect(live.log[first.t]?.view.racers[first.car]?.boostTicks).toBe(90);

    const frames = live.log.map((tick) => tick.inputs);
    const replay = decodeReplay(encodeReplay(createReplay(dustBowl.id, 11, 6, frames)));
    expect(replayInputs(replay).some((frame) => frame.slice(1).some((input) => input.action === true))).toBe(true);
    expect(runReplay(dustBowl, replay)).toEqual(carViews(live.world));

    // The player (car 0) replays its recorded inputs; the bots drive again live.
    const player = frames.map((frame) => frame[0] as CarInput);
    const again = race(dustBowl, 11, frames.length, (_w, car, bot, t) => (car === 0 ? (player[t] as CarInput) : bot));
    expect(again.log.length).toBe(live.log.length);
    again.log.forEach((tick, t) => expect(tick.view, `tick ${t}`).toEqual(live.log[t]?.view));
  });
});
