// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const cars = [car(0), car(10)];
/** Player finished 2nd, KOSKI (car 1) 1st. */
const finished: RaceView = {
  phase: 'finished',
  countdown: 0,
  raceTick: 7200,
  racers: [racer({ lapTicks: [2500, 2400, 2300], finishTick: 7200, lap: 3, position: 2 }), racer({ position: 1, finishTick: 7000 })],
};
const drivers = [
  { name: 'YOU', number: 1 },
  { name: 'KOSKI', number: 7 },
];
const finish = (): HTMLElement => document.querySelector('.ui-finish') as HTMLElement;
const rows = (): HTMLElement[] => Array.from(finish().querySelectorAll<HTMLElement>('li'));

describe('finish panel driver list', () => {
  it('AC6: lists every car in race-position order as "NAME · #n"', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard'], drivers);
    ui.sync(finished, cars);
    expect(finish().hidden).toBe(false);
    expect(rows().map((r) => r.textContent)).toEqual(['KOSKI · #7', 'YOU · #1']);
    const text = finish().textContent ?? '';
    expect(text.indexOf('KOSKI · #7')).toBeLessThan(text.indexOf('YOU · #1'));

    // A new race with the player in front flips the order.
    ui.reset(3, outline, ['rally-red', 'mustard'], drivers);
    ui.sync({ ...finished, racers: [racer({ finishTick: 7200, position: 1 }), racer({ position: 2 })] }, cars);
    expect(rows().map((r) => r.textContent)).toEqual(['YOU · #1', 'KOSKI · #7']);
  });

  it('AC7: three-argument reset shows time and best lap with no driver list; rows use token classes only', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(finished, cars);
    expect(finish().hidden).toBe(false);
    expect(finish().textContent).toContain('2:00.00');
    expect(finish().textContent).toContain('0:38.33');
    expect(finish().textContent).not.toContain('#');
    const list = finish().querySelector<HTMLElement>('.ui-finish__drivers');
    expect(list === null || list.hidden).toBe(true);

    // With drivers, the list is caps labels (an existing component) with no inline style.
    ui.reset(3, outline, ['rally-red', 'mustard'], drivers);
    ui.sync(finished, cars);
    expect(rows()).toHaveLength(2);
    for (const r of rows()) {
      expect(r.classList.contains('ui-label')).toBe(true);
      expect(r.getAttribute('style')).toBeNull();
      expect(r.closest('.ui-panel--navy')).not.toBeNull();
    }
    expect(finish().querySelector('[style]')).toBeNull();

    // And back to no list when the next race has no labels.
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(finished, cars);
    expect(rows()).toHaveLength(0);
  });
});
