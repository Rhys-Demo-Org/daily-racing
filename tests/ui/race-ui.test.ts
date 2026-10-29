// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi, GO_HIDE_TICKS } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const view = (over: Partial<RaceView> = {}): RaceView => ({ phase: 'racing', countdown: 0, raceTick: 0, racers: [racer(), racer({ position: 2 })], ...over });
const cars = [car(0), car(10)];

function setup() {
  const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
  ui.reset(3, outline, ['rally-red', 'mustard']);
  const q = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;
  return { ui, roundel: () => q('.ui-countdown').hidden ? null : q('.ui-cd-roundel')?.textContent, finish: () => q('.ui-finish') };
}

describe('race UI', () => {
  it('runs the countdown 3, 2, 1, GO!, wakes the touch controls at GO and clears GO! in sim time', () => {
    const { ui, roundel } = setup();
    const seen: (string | null | undefined)[] = [];
    for (const n of [3, 2, 1]) {
      ui.sync(view({ phase: 'countdown', countdown: n }), cars);
      seen.push(roundel());
    }
    expect(ui.touch.machine.state('gas')).not.toBe('active');
    ui.sync(view({ raceTick: 0 }), cars);
    seen.push(roundel());
    expect(seen.map((t) => t?.toUpperCase())).toEqual(['3', '2', '1', 'GO!']);
    expect(ui.touch.machine.state('gas')).toBe('active');
    ui.sync(view({ raceTick: GO_HIDE_TICKS - 1 }), cars);
    expect(roundel()).not.toBeNull();
    ui.sync(view({ raceTick: GO_HIDE_TICKS }), cars);
    expect(roundel()).toBeNull();
  });

  it('restarts the countdown cleanly after reset (race again)', () => {
    const { ui, roundel } = setup();
    ui.sync(view({ phase: 'countdown', countdown: 3 }), cars);
    ui.reset(3, outline, ['rally-red', 'mustard']);
    expect(roundel()).toBeNull();
    ui.sync(view({ phase: 'countdown', countdown: 3 }), cars);
    expect(roundel()).toBe('3');
  });

  it('shows the finish panel once, with the final time and best lap', () => {
    const { ui, finish } = setup();
    const done = view({ phase: 'finished', raceTick: 7200, racers: [racer({ lapTicks: [2500, 2400, 2300], finishTick: 7200, lap: 3 }), racer()] });
    expect(finish().hidden).toBe(true);
    ui.sync(done, cars);
    expect(finish().hidden).toBe(false);
    expect(finish().textContent).toContain('2:00.00');
    expect(finish().textContent).toContain('0:38.33');
    const obs = new MutationObserver(() => {});
    obs.observe(finish(), { subtree: true, childList: true, characterData: true, attributes: true });
    ui.sync({ ...done, raceTick: 7300 }, cars);
    ui.sync({ ...done, raceTick: 7400 }, cars);
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
  });

  it('touches no DOM when a frame changes nothing', () => {
    const { ui } = setup();
    const frame = view({ raceTick: 600 });
    ui.sync(frame, cars);
    const obs = new MutationObserver(() => {});
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    ui.sync(frame, cars);
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
  });
});
