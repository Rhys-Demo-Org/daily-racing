// @vitest-environment happy-dom
// B12 AC8: the Boost button carries the lightning-bolt icon, not just any icon.
import { expect, it, vi } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

/** The lightning bolt drawn on the 24 grid (icons.ts, board 02). */
const BOLT = '14,2 4,14 11,14 9,22 20,9 13,9';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });

it('AC8: the Boost button shows the lightning bolt icon', () => {
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = new EventTarget() as MediaQueryList;
    Object.assign(list, { media: query, matches: query.includes('coarse'), onchange: null, addListener() {}, removeListener() {} });
    return list;
  });
  const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
  ui.reset(3, outline, ['rally-red', 'mustard']);
  const view: RaceView = {
    phase: 'racing',
    countdown: 0,
    raceTick: 600,
    racers: [racer({ armed: false, boostTicks: 0 }), racer({ position: 2, armed: false, boostTicks: 0 })],
    pickups: [true, true],
  };
  for (const armed of [false, true]) {
    ui.sync({ ...view, racers: [racer({ armed, boostTicks: 0 }), ...view.racers.slice(1)] }, [car(0), car(10)]);
    const b = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === 'Boost');
    const polys = [...(b?.querySelectorAll('svg polygon') ?? [])].map((p) => p.getAttribute('points'));
    expect(polys).toEqual([BOLT]);
  }
});
