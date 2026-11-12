// @vitest-environment happy-dom
// B05: on a desktop (fine pointer, viewport ≥ 1224×566) the race UI shows a "Keyboard controls"
// keycap legend during the player's first lap only; never on touch or a small viewport.
import { describe, expect, it, vi } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { STAGES } from '../../src/ui/stages/registry.ts';
import { outline } from './helpers.ts';

interface Device {
  coarse: boolean;
  width: number;
  height: number;
}

const DESKTOP: Device = { coarse: false, width: 1440, height: 900 };

/** matchMedia for a device: evaluates `and`-joined pointer / min-width / min-height features. */
function useDevice(d: Device): void {
  const matches = (query: string): boolean =>
    query.split(/\s+and\s+/).every((part) => {
      const m = /\(\s*([\w-]+)\s*:\s*([\w.]+?)(px)?\s*\)/.exec(part);
      if (!m) return false;
      const [, feature, value] = m;
      if (feature === 'pointer') return value === (d.coarse ? 'coarse' : 'fine');
      if (feature === 'min-width') return d.width >= Number(value);
      if (feature === 'min-height') return d.height >= Number(value);
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
const view = (me: Partial<RacerView>, over: Partial<RaceView> = {}): RaceView => ({
  phase: 'racing',
  countdown: 0,
  raceTick: 600,
  racers: [racer(me), racer({ position: 2 })],
  ...over,
});
const cars = [car(0), car(10)];
const lap2 = { lapsCompleted: 1, lap: 2, lapTicks: [2400] };

function setup() {
  const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
  ui.reset(3, outline, ['rally-red', 'mustard']);
  return ui;
}

const legend = (): HTMLElement | null => document.querySelector('[role="group"][aria-label="Keyboard controls"]');

/** Present and with no `hidden` / `aria-hidden` ancestor. */
function visible(el: Element | null): boolean {
  if (!el) return false;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return false;
  }
  return true;
}

const labels = (): string[] => [...(legend()?.querySelectorAll('.ui-label') ?? [])].map((l) => (l.textContent ?? '').trim().toUpperCase());

describe('keycap legend', () => {
  it('AC3: shows a "Keyboard controls" group on desktop during lap 1, labelled STEER, GAS, BRAKE, PAUSE, with no power-up', () => {
    useDevice(DESKTOP);
    const ui = setup();
    ui.sync(view({}, { phase: 'countdown', countdown: 3, raceTick: 0 }), cars);
    expect(visible(legend())).toBe(true);
    ui.sync(view({}), cars);
    expect(visible(legend())).toBe(true);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'PAUSE']);
    const text = (legend()?.textContent ?? '').toUpperCase();
    expect(text).not.toContain('SPACE');
    expect(text).not.toContain('POWER-UP');
  });

  it('AC4: steer, gas and brake keycaps hold SVG icons, no arrow characters, and the pause key reads ESC', () => {
    useDevice(DESKTOP);
    setup().sync(view({}), cars);
    const group = legend();
    if (!group) throw new Error('no legend');
    expect(group.textContent).not.toMatch(/[←→↑↓]/);
    const items = [...group.children];
    expect(items).toHaveLength(4);
    const keycaps = (i: number): Element[] => [...(items[i]?.children ?? [])].filter((c) => !c.classList.contains('ui-label'));
    const iconKeys = [0, 1, 2].flatMap(keycaps);
    expect(iconKeys).toHaveLength(4);
    for (const k of iconKeys) expect(k.querySelector('svg')).not.toBeNull();
    const pause = keycaps(3);
    expect(pause).toHaveLength(1);
    expect(pause[0]?.textContent?.trim().toUpperCase()).toBe('ESC');
  });

  it('AC5: hides once the player completes lap 1, stays hidden, and returns after the next reset on lap 1', () => {
    useDevice(DESKTOP);
    const ui = setup();
    ui.sync(view({}), cars);
    expect(visible(legend())).toBe(true);
    ui.sync(view(lap2, { raceTick: 2500 }), cars);
    expect(visible(legend())).toBe(false);
    ui.sync(view(lap2, { raceTick: 2600 }), cars);
    ui.sync(view({ lapsCompleted: 3, lap: 3, lapTicks: [2400, 2400, 2400], finishTick: 7200 }, { phase: 'finished', raceTick: 7200 }), cars);
    expect(visible(legend())).toBe(false);
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(view({}, { phase: 'countdown', countdown: 3, raceTick: 0 }), cars);
    expect(visible(legend())).toBe(true);
  });

  it('AC6: never shows on a touch device or a viewport below 1224×566, even on lap 1; a registered stage shows it', () => {
    useDevice(DESKTOP);
    setup().sync(view({}), cars);
    expect(visible(legend())).toBe(true);
    for (const d of [
      { coarse: true, width: 1440, height: 900 },
      { coarse: false, width: 1223, height: 900 },
      { coarse: false, width: 1440, height: 565 },
    ]) {
      document.body.replaceChildren();
      useDevice(d);
      setup().sync(view({}), cars);
      expect(legend(), JSON.stringify(d)).not.toBeNull();
      expect(visible(legend()), JSON.stringify(d)).toBe(false);
    }

    useDevice(DESKTOP);
    const shown = STAGES.filter((s) => {
      document.body.replaceChildren();
      const root = document.createElement('div');
      document.body.append(root);
      s.render(root);
      return visible(legend());
    });
    expect(shown.map((s) => s.name)).toContain('hud--first-lap');
    expect(shown.map((s) => s.name)).not.toContain('hud--mid-race');
  });
});
