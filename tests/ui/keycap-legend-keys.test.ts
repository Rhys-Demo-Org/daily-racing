// @vitest-environment happy-dom
// B05 AC4 (finding R5-2): each keycap in the "Keyboard controls" legend carries the right arrow
// (← → STEER, ↑ GAS, ↓ BRAKE), and only GAS is the rally-red primary keycap, as in the mockup.
import { expect, it, vi } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { icon, type IconName } from '../../src/ui/icons.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

/** Desktop matchMedia: fine pointer, 1440×900. */
function useDesktop(): void {
  const matches = (query: string): boolean =>
    query.split(/\s+and\s+/).every((part) => {
      const m = /\(\s*([\w-]+)\s*:\s*([\w.]+?)(px)?\s*\)/.exec(part);
      if (!m) return false;
      const [, feature, value] = m;
      if (feature === 'pointer') return value === 'fine';
      if (feature === 'min-width') return 1440 >= Number(value);
      if (feature === 'min-height') return 900 >= Number(value);
      return false;
    });
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = new EventTarget() as MediaQueryList;
    Object.assign(list, { media: query, matches: matches(query), onchange: null, addListener() {}, removeListener() {} });
    return list;
  });
}

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const view: RaceView = { phase: 'racing', countdown: 0, raceTick: 600, racers: [racer(), racer({ position: 2 })] };

const shape = (svg: Element | null): string[] => [...(svg?.querySelectorAll('polygon') ?? [])].map((p) => p.getAttribute('points') ?? '');

it('AC4: the legend keycaps show ← → for STEER, ↑ on rally-red for GAS and ↓ for BRAKE', () => {
  useDesktop();
  const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
  ui.reset(3, outline, ['rally-red', 'mustard']);
  ui.sync(view, [car(0), car(10)]);
  const group = document.querySelector('[role="group"][aria-label="Keyboard controls"]');
  if (!group) throw new Error('no legend');

  const byLabel = new Map(
    [...group.children].map((item) => [
      (item.querySelector('.ui-label')?.textContent ?? '').trim().toUpperCase(),
      [...item.children].filter((c) => !c.classList.contains('ui-label')),
    ]),
  );
  const expected: [string, IconName[]][] = [
    ['STEER', ['key-left', 'key-right']],
    ['GAS', ['key-up']],
    ['BRAKE', ['key-down']],
  ];
  for (const [label, names] of expected) {
    const keys = byLabel.get(label) ?? [];
    expect(keys.map((k) => shape(k.querySelector('svg')))).toEqual(names.map((n) => shape(icon(n))));
    for (const k of keys) expect(k.classList.contains('ui-keycap--primary')).toBe(label === 'GAS');
  }
  for (const k of byLabel.get('PAUSE') ?? []) expect(k.classList.contains('ui-keycap--primary')).toBe(false);
});
