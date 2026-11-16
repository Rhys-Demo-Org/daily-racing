// B12 replays: the action button is replay flag bit 2 (AC6).
import { describe, expect, it } from 'vitest';
import {
  carViews,
  createBot,
  createReplay,
  createWorld,
  decodeInputs,
  decodeReplay,
  encodeInputs,
  encodeReplay,
  raceView,
  replayInputs,
  runReplay,
  stepWorld,
  type CarInput,
} from '../../src/sim/index.ts';
import { dustBowl } from './helpers.ts';

describe('B12 replay action flag', () => {
  it('AC6: action is stored as flag bit 2 and decodes back to action: true; frames with bit 2 clear have no action key', () => {
    const frames: CarInput[][] = [
      [
        { steer: 0, throttle: true, brake: false, action: true },
        { steer: 0, throttle: false, brake: false },
      ],
    ];
    // Bytes: 00 05 (throttle | action), 00 00.
    expect(encodeInputs(frames, 2)).toBe('AAUAAA==');
    const [decoded] = decodeInputs(encodeInputs(frames, 2), 1, 2);
    expect(decoded?.[0]?.action).toBe(true);
    expect(decoded?.[0]?.throttle).toBe(true);
    expect(decoded?.[0]?.brake).toBe(false);
    expect('action' in (decoded?.[1] as CarInput)).toBe(false);
  });

  it('AC6: runReplay of a recorded Dust Bowl run with one fired boost reproduces the live run exactly', () => {
    const carCount = 3;
    const live = createWorld(dustBowl, { seed: 12, carCount });
    const bots = live.cars.map((_, i) => createBot(live, i));
    const frames: CarInput[][] = [];
    let boosted = false;
    for (let t = 0; t < 1400; t++) {
      const frame = bots.map((b) => ({ ...b.input(live) }));
      const me = raceView(live).racers[0];
      // Fire once, as soon as the player is armed.
      if (!boosted && me?.armed) (frame[0] as CarInput).action = true;
      stepWorld(live, frame);
      if (raceView(live).racers[0]?.boostTicks === 90) boosted = true;
      frames.push(frame);
    }
    expect(boosted).toBe(true);
    const replay = decodeReplay(encodeReplay(createReplay(dustBowl.id, 12, carCount, frames)));
    expect(replayInputs(replay).flat().filter((i) => i.action === true)).toHaveLength(1);
    expect(runReplay(dustBowl, replay)).toEqual(carViews(live));
  });
});
