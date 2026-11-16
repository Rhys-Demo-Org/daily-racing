// @vitest-environment happy-dom
// B12: the Boost (action) touch button and the SPACE · POWER-UP keycap appear only for pickup
// RaceViews (AC8, AC9).
import { describe, expect, it, vi } from 'vitest';
import { tokens } from '@tokens';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { STAGES } from '../../src/ui/stages/registry.ts';
import { outline } from './helpers.ts';

/** matchMedia for a touch phone (coarse) or a 1440×900 desktop (fine). */
function useDevice(coarse: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = new EventTarget() as MediaQueryList;
    const matches = query.includes('coarse') ? coarse : query.includes('(pointer: fine)') ? !coarse : false;
    Object.assign(list, { media: query, matches, onchange: null, addListener() {}, removeListener() {} });
    return list;
  });
}

/** Lays slots out like a browser: zero size inside anything hidden. */
const layout = () =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.closest('[hidden]') ? new DOMRect() : new DOMRect(700, 200, 64, 64);
  });

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const cars = [car(0), car(10)];
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
/** A racing view; `armed` undefined = a track without pickups. */
function view(armed?: boolean, raceTick = 600): RaceView {
  if (armed === undefined) return { phase: 'racing', countdown: 0, raceTick, racers: [racer(), racer({ position: 2 })] };
  return {
    phase: 'racing',
    countdown: 0,
    raceTick,
    racers: [racer({ armed, boostTicks: 0 }), racer({ position: 2, armed: false, boostTicks: 0 })],
    pickups: [true, !armed, true],
  };
}

function setup() {
  const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
  ui.reset(3, outline, ['rally-red', 'mustard']);
  return ui;
}

const boost = (): HTMLButtonElement | null =>
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Boost') ?? null;
const legend = (): HTMLElement | null => document.querySelector('[role="group"][aria-label="Keyboard controls"]');
const labels = (): string[] => [...(legend()?.querySelectorAll('.ui-label') ?? [])].map((l) => (l.textContent ?? '').trim().toUpperCase());

describe('B12 Boost button', () => {
  it('AC8: a RaceView with `armed` adds a Boost button with the lightning icon, disabled until armed', () => {
    useDevice(true);
    layout();
    const ui = setup();
    ui.sync(view(false), cars);
    const b = boost();
    expect(b).not.toBeNull();
    expect(b?.closest('.ui-touch')).not.toBeNull();
    expect(b?.querySelector('svg polygon')).not.toBeNull();
    expect(b?.getAttribute('aria-disabled')).toBe('true');
    expect(ui.touch.zones().map((z) => z.id)).toEqual(['left', 'right', 'gas', 'brake', 'action']);
    ui.sync(view(true, 601), cars);
    expect(boost()).toBe(b);
    expect(b?.getAttribute('aria-disabled')).not.toBe('true');
    ui.sync(view(false, 700), cars);
    expect(b?.getAttribute('aria-disabled')).toBe('true');
  });

  it('AC8: it is marked popping on the sync where armed turns true, only then, and the mark clears after the motion', () => {
    vi.useFakeTimers();
    useDevice(true);
    const ui = setup();
    ui.sync(view(false), cars);
    expect(boost()?.classList.contains('is-popping')).toBe(false);
    ui.sync(view(true, 601), cars);
    expect(boost()?.classList.contains('is-popping')).toBe(true);
    vi.advanceTimersByTime(tokens.motion.durationMs.release);
    expect(boost()?.classList.contains('is-popping')).toBe(false);
    ui.sync(view(true, 602), cars);
    expect(boost()?.classList.contains('is-popping')).toBe(false);
    ui.sync(view(false, 700), cars);
    expect(boost()?.classList.contains('is-popping')).toBe(false);
    ui.sync(view(true, 900), cars);
    expect(boost()?.classList.contains('is-popping')).toBe(true);
  });

  it('AC8: with no `armed` field there is no Boost button and there are 4 touch zones', () => {
    useDevice(true);
    layout();
    const ui = setup();
    ui.sync(view(), cars);
    expect(boost()).toBeNull();
    expect(ui.touch.zones()).toHaveLength(4);
    // A pickup race, then a race without pickups: the button goes again.
    ui.sync(view(false), cars);
    expect(boost()).not.toBeNull();
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(view(), cars);
    expect(boost()).toBeNull();
    expect(ui.touch.zones()).toHaveLength(4);
  });
});

describe('B12 keycap legend', () => {
  it('AC9: on desktop a pickup RaceView lists STEER, GAS, BRAKE, POWER-UP, PAUSE with a SPACE keycap; without pickups it is unchanged', () => {
    useDevice(false);
    const ui = setup();
    ui.sync(view(), cars);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'PAUSE']);
    expect(legend()?.textContent).not.toContain('SPACE');
    ui.sync(view(false), cars);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'POWER-UP', 'PAUSE']);
    const item = [...(legend()?.children ?? [])][3];
    expect(item?.textContent?.replace('POWER-UP', '').trim()).toBe('SPACE');
    document.body.replaceChildren();
    const plain = setup();
    plain.sync(view(), cars);
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'PAUSE']);
  });

  it('AC9: a registered stage renders the armed Boost button', () => {
    useDevice(true);
    const armed = STAGES.filter((s) => {
      document.body.replaceChildren();
      const root = document.createElement('div');
      document.body.append(root);
      s.render(root);
      const b = boost();
      return b !== null && b.getAttribute('aria-disabled') !== 'true';
    });
    expect(armed.length).toBeGreaterThan(0);
  });
});
