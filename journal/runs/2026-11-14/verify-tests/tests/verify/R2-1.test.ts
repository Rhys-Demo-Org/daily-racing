// @vitest-environment happy-dom
// R2-1: touch zones measured while the slots slide in (transform included in
// getBoundingClientRect) must not stay cached once the slots have come to rest before GO.
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import type { TouchZone } from '../../src/input/touch.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from '../ui/helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const view = (countdown: number): RaceView => ({ phase: 'countdown', countdown, raceTick: 0, racers: [racer(), racer({ position: 2 })] });
const cars = [car(0), car(10)];

const gasY = (zones: readonly TouchZone[]): number | undefined => {
  const z = zones.find((z) => z.id === 'gas');
  return z?.shape === 'circle' ? z.cy : undefined;
};

describe('R2-1', () => {
  it('re-measures the touch zones once the entry slide has settled, before GO', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.touch.element.hidden = false;
    // Slide offset as getBoundingClientRect reports it: 195px (50vh at 844×390) mid-slide, 0 at rest.
    let offset = 195;
    const slots = [...ui.touch.element.querySelectorAll<HTMLElement>('.ui-touch__slot')];
    expect(slots).toHaveLength(4);
    slots.forEach((s, i) => {
      s.getBoundingClientRect = () => ({ left: 100 * i, top: 300 + offset, width: 50, height: 50, right: 100 * i + 50, bottom: 350 + offset, x: 100 * i, y: 300 + offset, toJSON: () => ({}) }) as DOMRect;
    });

    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(view(3), cars);
    // A touch ~250ms after reset: the input layer hit-tests against zones() mid-slide.
    expect(gasY(ui.touch.zones())).toBe(325 + 195);
    // The slide ends (slots at rest, animationend fires), still in the countdown.
    offset = 0;
    for (const s of slots) s.dispatchEvent(new Event('animationend', { bubbles: true }));
    ui.sync(view(2), cars);
    expect(gasY(ui.touch.zones()), 'GAS zone where GAS is drawn').toBe(325);
  });
});
