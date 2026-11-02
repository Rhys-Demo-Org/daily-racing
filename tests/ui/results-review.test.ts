// @vitest-environment happy-dom
// Post-build review of B02: fixes and edge cases beyond the spec's acceptance tests.
import { describe, expect, it } from 'vitest';
import type { RaceView, RacerView } from '../../src/sim/types.ts';
import { formatGap, ticksToMs } from '../../src/ui/format.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const finished = (racers: RacerView[]): RaceView => ({ phase: 'finished', countdown: 0, raceTick: 8000, racers });

function setup(laps: number, colours: ('rally-red' | 'mustard' | 'teal')[], carNumbers: number[]) {
  const ui = createRaceUi(document.body, { onRaceAgain: () => {}, onNextRace: () => {} });
  ui.reset(laps, outline, colours, { trackName: 'Dust Bowl', carNumbers });
  const screen = (): HTMLElement => document.querySelector('.ui-results') as HTMLElement;
  const drivers = (): string[] => [...screen().querySelectorAll('[role="rowgroup"] [role="row"]')].map((r) => r.querySelector('[role="cell"]:nth-child(2)')?.textContent ?? '');
  return { ui, screen, drivers };
}

describe('results screen review', () => {
  it('formatGap strips only the zero minute and leading zero, and carries rounding into minutes', () => {
    expect(formatGap(0)).toBe('+0.00');
    expect(formatGap(5300)).toBe('+5.30');
    expect(formatGap(12000)).toBe('+12.00');
    expect(formatGap(59999)).toBe('+1:00.00');
    expect(formatGap(70000)).toBe('+1:10.00');
    expect(ticksToMs(60)).toBe(1000);
  });

  it('says "1 lap", not "1 laps", for a one-lap race', () => {
    const { ui, screen } = setup(1, ['rally-red', 'mustard'], [1, 7]);
    ui.sync(finished([racer({ finishTick: 2400 }), racer({ position: 2 })]), []);
    expect(screen().textContent?.toLowerCase()).toContain('race complete · 1 lap');
    expect(screen().textContent?.toLowerCase()).not.toContain('1 laps');
  });

  it('reorders unfinished cars when they change places after the screen opened', () => {
    const { ui, drivers } = setup(3, ['rally-red', 'mustard', 'teal'], [1, 7, 12]);
    ui.sync(finished([racer({ finishTick: 7200 }), racer({ position: 2 }), racer({ position: 3 })]), []);
    expect(drivers()).toEqual(['YOU · #1', 'CPU · #7', 'CPU · #12']);
    ui.sync(finished([racer({ finishTick: 7200 }), racer({ position: 3 }), racer({ position: 2 })]), []);
    expect(drivers()).toEqual(['YOU · #1', 'CPU · #12', 'CPU · #7']);
  });

  it('places the roundel and the table by the sim position, matching the HUD', () => {
    const { ui, screen, drivers } = setup(3, ['rally-red', 'mustard', 'teal'], [1, 7, 12]);
    ui.sync(finished([racer({ finishTick: 7500, position: 3 }), racer({ finishTick: 7200 }), racer({ finishTick: 7300, position: 2 })]), []);
    expect(drivers()).toEqual(['CPU · #7', 'CPU · #12', 'YOU · #1']);
    expect(screen().querySelector('.ui-results__roundel')?.textContent).toBe('3RD');
  });
});
