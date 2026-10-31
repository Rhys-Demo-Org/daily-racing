// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { ordinal } from '../../src/ui/format.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const finished = (racers: RacerView[]): RaceView => ({ phase: 'finished', countdown: 0, raceTick: 8000, racers });
const cars = [car(0), car(10), car(20)];
const LAPS = [2500, 2400, 2300];

function setup(colours: ('rally-red' | 'mustard' | 'teal')[] = ['rally-red', 'mustard'], carNumbers = [1, 7]) {
  const onRaceAgain = vi.fn();
  const onNextRace = vi.fn();
  const ui = createRaceUi(document.body, { onRaceAgain, onNextRace });
  ui.reset(3, outline, colours, { trackName: 'Dust Bowl', carNumbers });
  const screen = (): HTMLElement => document.querySelector('.ui-results') as HTMLElement;
  const rows = (): HTMLElement[] => [...screen().querySelectorAll<HTMLElement>('[role="rowgroup"] [role="row"]')];
  const cells = (row: HTMLElement): string[] => [...row.querySelectorAll('[role="cell"]')].map((c) => c.textContent ?? '');
  const button = (text: string): HTMLButtonElement =>
    [...screen().querySelectorAll('button')].find((b) => b.textContent?.toUpperCase() === text) as HTMLButtonElement;
  return { ui, onRaceAgain, onNextRace, screen, rows, cells, button };
}

describe('results screen', () => {
  it('AC1: shows stripes, race label, track name and the best-lap chip', () => {
    const { ui, screen } = setup();
    expect(screen().hidden).toBe(true);
    ui.sync(finished([racer({ lapTicks: LAPS, finishTick: 7200, lap: 3 }), racer({ position: 2 })]), cars);
    const el = screen();
    expect(el.hidden).toBe(false);
    expect(el.classList.contains('ui-finish')).toBe(true);
    expect(el.querySelectorAll('.ui-stripes .ui-stripe')).toHaveLength(3);
    expect(el.textContent?.toLowerCase()).toContain('race complete · 3 laps');
    expect(el.textContent).toContain('Dust Bowl');
    const chip = el.querySelector('.ui-panel--mustard');
    expect(chip?.textContent).toContain('0:38.33');
  });

  it('AC2: table has POS/DRIVER/TIME/GAP headers and one row per car in finishing order', () => {
    const { ui, screen, rows, cells } = setup(['rally-red', 'mustard', 'teal'], [1, 7, 12]);
    ui.sync(finished([racer({ finishTick: 7300, position: 2 }), racer({ finishTick: 7200, position: 1 }), racer({ finishTick: 7500, position: 3 })]), cars);
    const headers = [...screen().querySelectorAll('[role="columnheader"]')].map((c) => c.textContent?.toUpperCase());
    expect(headers).toEqual(['POS', 'DRIVER', 'TIME', 'GAP']);
    expect(rows()).toHaveLength(3);
    expect(rows().map((r) => cells(r).slice(0, 3))).toEqual([
      ['1', 'CPU · #7', '2:00.00'],
      ['2', 'YOU · #1', '2:01.67'],
      ['3', 'CPU · #12', '2:05.00'],
    ]);
  });

  it('AC3: GAP is an en dash for the leader and +s.cc / +m:ss.cc behind', () => {
    const { ui, rows, cells } = setup(['rally-red', 'mustard', 'teal'], [1, 7, 12]);
    ui.sync(finished([racer({ finishTick: 7200 }), racer({ finishTick: 7237 }), racer({ finishTick: 11400 })]), cars);
    expect(rows().map((r) => cells(r)[3])).toEqual(['–', '+0.62', '+1:10.00']);
  });

  it('AC4: unfinished cars come last with dashes, fill in later, and unchanged syncs touch no DOM', () => {
    const { ui, screen, rows, cells } = setup();
    const done = finished([racer({ lapTicks: LAPS, finishTick: 7200 }), racer({ position: 2 })]);
    ui.sync(done, cars);
    expect(rows().map((r) => cells(r))).toEqual([
      ['1', 'YOU · #1', '2:00.00', '–'],
      ['2', 'CPU · #7', '–:––.––', '–:––.––'],
    ]);
    const obs = new MutationObserver(() => {});
    obs.observe(screen(), { subtree: true, childList: true, characterData: true, attributes: true });
    ui.sync({ ...done, raceTick: 8100 }, cars);
    ui.sync({ ...done, raceTick: 8200, racers: [racer({ lapTicks: LAPS, finishTick: 7200 }), racer({ position: 2 })] }, cars);
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
    ui.sync(finished([racer({ lapTicks: LAPS, finishTick: 7200 }), racer({ finishTick: 7237, position: 2 })]), cars);
    expect(cells(rows()[1] as HTMLElement)).toEqual(['2', 'CPU · #7', '2:00.62', '+0.62']);
  });

  it('AC5: only the player row has the player modifier, and rows carry their deal index', () => {
    const { ui, rows } = setup(['rally-red', 'mustard', 'teal'], [1, 7, 12]);
    ui.sync(finished([racer({ finishTick: 7300 }), racer({ finishTick: 7200 }), racer({ finishTick: 7500 })]), cars);
    const r = rows();
    expect(r.map((row) => row.classList.contains('ui-results__row--player'))).toEqual([false, true, false]);
    expect(document.querySelectorAll('.ui-results__row--player')).toHaveLength(1);
    expect(r.map((row) => row.style.getPropertyValue('--ui-deal-index').trim())).toEqual(['0', '1', '2']);
  });

  it('AC6: the placing roundel shows the ordinal, and ordinal() formats placings', () => {
    const win = setup();
    win.ui.sync(finished([racer({ finishTick: 7200 }), racer({ position: 2 })]), cars);
    expect(win.screen().querySelector('.ui-results__roundel')?.textContent).toBe('1ST');
    document.body.replaceChildren();
    const lose = setup();
    lose.ui.sync(finished([racer({ finishTick: 7300, position: 2 }), racer({ finishTick: 7200 })]), cars);
    expect(lose.screen().querySelector('.ui-results__roundel')?.textContent).toBe('2ND');
    const cases: [number, string][] = [[1, '1ST'], [2, '2ND'], [3, '3RD'], [4, '4TH'], [11, '11TH'], [12, '12TH'], [13, '13TH'], [21, '21ST'], [22, '22ND']];
    for (const [n, s] of cases) expect(ordinal(n)).toBe(s);
  });

  it('AC7: RETRY and NEXT RACE fire once per click, NEXT RACE is focused, reset clears rows, no inline colours', () => {
    const { ui, screen, rows, button, onRaceAgain, onNextRace } = setup();
    ui.sync(finished([racer({ finishTick: 7200 }), racer({ position: 2 })]), cars);
    const next = button('NEXT RACE');
    const retry = button('RETRY');
    expect(document.activeElement).toBe(next);
    retry.click();
    expect(onRaceAgain).toHaveBeenCalledTimes(1);
    expect(onNextRace).toHaveBeenCalledTimes(0);
    next.click();
    expect(onNextRace).toHaveBeenCalledTimes(1);
    expect(onRaceAgain).toHaveBeenCalledTimes(1);

    ui.reset(3, outline, ['rally-red', 'mustard'], { trackName: 'Dust Bowl', carNumbers: [1, 7] });
    expect(screen().hidden).toBe(true);
    ui.sync(finished([racer({ finishTick: 9000, position: 2 }), racer({ finishTick: 8000 })]), cars);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.textContent).toContain('CPU · #7');
    expect(document.querySelectorAll('.ui-results')).toHaveLength(1);

    const COLOUR_PROPS = /(^|;|\s)(color|background|background-color|fill|stroke|border|border-color|outline|outline-color|box-shadow)\s*:/i;
    for (const el of screen().querySelectorAll('*')) {
      const style = el.getAttribute('style') ?? '';
      expect(style).not.toMatch(COLOUR_PROPS);
      expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      for (const attr of ['fill', 'stroke', 'color', 'stop-color']) expect(el.getAttribute(attr)).toBeNull();
    }
  });
});
