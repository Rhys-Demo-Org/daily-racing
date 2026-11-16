// @vitest-environment happy-dom
// R2-4: on a pickup track, a frame where nothing changed must touch no DOM.
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const cars = [car(0), car(10)];

describe('R2-4', () => {
  it('touches no DOM when a pickup-track frame changes nothing', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    const frame: RaceView = {
      phase: 'racing',
      countdown: 0,
      raceTick: 600,
      racers: [racer({ armed: false, boostTicks: 0 }), racer({ position: 2, armed: false, boostTicks: 0 })],
      pickups: [true],
    };
    ui.sync(frame, cars);
    const obs = new MutationObserver(() => {});
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    ui.sync(frame, cars);
    const records = obs.takeRecords();
    expect(records.map((r) => (r.target as HTMLElement).className)).toEqual([]);
    obs.disconnect();
  });

  it('still lists POWER-UP on pickup tracks and drops it without pickups', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const ui = createRaceUi(root, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    const base: RaceView = { phase: 'racing', countdown: 0, raceTick: 600, racers: [racer(), racer({ position: 2 })] };
    const labels = (): string[] => [...root.querySelectorAll('.ui-keys__label')].map((e) => e.textContent ?? '');
    ui.sync({ ...base, racers: [racer({ armed: false, boostTicks: 0 }), racer({ position: 2, armed: false, boostTicks: 0 })], pickups: [true] }, cars);
    ui.sync({ ...base, racers: [racer({ armed: false, boostTicks: 0 }), racer({ position: 2, armed: false, boostTicks: 0 })], pickups: [true] }, cars);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'POWER-UP', 'PAUSE']);
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(base, cars);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'PAUSE']);
  });
});
