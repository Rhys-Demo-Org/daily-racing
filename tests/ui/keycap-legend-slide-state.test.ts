// @vitest-environment happy-dom
// The keycap legend slides out once the player completes lap 1 (UI_RULES §7): the race UI flips the
// legend's `is-out` state and aria-hidden in the same sync, leaving the layer displayed so the CSS
// can slide the panel off; keycap-legend-slide.test.ts checks that state's motion in Chromium.
import { describe, expect, it, vi } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

/** A 1440×900 fine-pointer desktop: every media query the legend asks matches. */
function useDesktop(): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = new EventTarget() as MediaQueryList;
    Object.assign(list, { media: query, matches: !query.includes('coarse'), onchange: null, addListener() {}, removeListener() {} });
    return list;
  });
}

const car: CarView = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false };
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const view = (me: Partial<RacerView>, raceTick: number): RaceView => ({ phase: 'racing', countdown: 0, raceTick, racers: [racer(me), racer({ position: 2 })] });

const layer = (): HTMLElement => {
  const el = document.querySelector('[aria-label="Keyboard controls"]')?.parentElement;
  if (!el) throw new Error('no legend');
  return el;
};

describe('keycap legend slide-out state', () => {
  it('AC: completing lap 1 puts the displayed legend in its slide-out state at once; the next reset brings it back', () => {
    useDesktop();
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(view({}, 600), [car, car]);
    expect(layer().classList.contains('is-out')).toBe(false);
    expect(layer().hasAttribute('aria-hidden')).toBe(false);

    ui.sync(view({ lapsCompleted: 1, lap: 2, lapTicks: [2400] }, 2500), [car, car]);
    expect(layer().classList.contains('is-out')).toBe(true);
    expect(layer().getAttribute('aria-hidden')).toBe('true');
    // Still displayed, so the panel can slide off rather than vanish.
    expect(layer().hidden).toBe(false);

    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(view({}, 0), [car, car]);
    expect(layer().classList.contains('is-out')).toBe(false);
    expect(layer().hasAttribute('aria-hidden')).toBe(false);
    expect(layer().hidden).toBe(false);
  });
});
