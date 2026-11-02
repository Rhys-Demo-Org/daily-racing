// @vitest-environment happy-dom
// B03 roster names on the B02 results table: the DRIVER column reads "<NAME> · #<number>".
import { describe, expect, it } from 'vitest';
import type { RaceView, RacerView } from '../../src/sim/types.ts';
import { ROSTER, raceDrivers } from '../../src/content/drivers.ts';
import { createRaceUi, type RaceInfo } from '../../src/ui/race-ui.ts';
import { outline } from './helpers.ts';

const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const finished = (racers: RacerView[]): RaceView => ({ phase: 'finished', countdown: 0, raceTick: 8000, racers });

function setup(carCount: number, info: (drivers: ReturnType<typeof raceDrivers>) => RaceInfo) {
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createRaceUi(root, { onRaceAgain: () => {} });
  const drivers = raceDrivers(carCount);
  const reset = (): void => ui.reset(3, outline, drivers.map((d) => d.body), info(drivers));
  reset();
  const rows = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.ui-results [role="rowgroup"] [role="row"]')];
  const driverCells = (): string[] => rows().map((r) => r.querySelectorAll('[role="cell"]')[1]?.textContent ?? '');
  return { ui, reset, rows, driverCells };
}

const named = (drivers: ReturnType<typeof raceDrivers>): RaceInfo => ({
  trackName: 'Dust Bowl',
  carNumbers: drivers.map((d) => d.number),
  driverNames: drivers.map((d) => d.name),
});

describe('results table driver names', () => {
  it('AC6: the DRIVER column lists roster names in race-position order, the player as YOU', () => {
    const { ui, reset, rows, driverCells } = setup(2, named);
    // KOSKI wins, the player is 2nd.
    ui.sync(finished([racer({ finishTick: 7300, position: 2 }), racer({ finishTick: 7200, position: 1 })]), []);
    expect(driverCells()).toEqual(['KOSKI · #7', 'YOU · #1']);
    expect(rows()[1]?.classList.contains('ui-results__row--player')).toBe(true);
    expect(rows()[0]?.classList.contains('ui-results__row--player')).toBe(false);

    // Next race, the player wins.
    reset();
    ui.sync(finished([racer({ finishTick: 7200, position: 1 }), racer({ position: 2 })]), []);
    expect(driverCells()).toEqual(['YOU · #1', 'KOSKI · #7']);
  });

  it('AC6: a full six-car grid names every roster driver, and a late finisher keeps its name', () => {
    const { ui, driverCells } = setup(6, named);
    const order = [6, 1, 2, 3, 4, 5]; // the player last
    ui.sync(finished(order.map((position, i) => racer({ position, finishTick: i === 0 ? 9000 : 7000 + position }))), []);
    expect(driverCells()).toEqual(['KOSKI · #7', 'BRUNO · #23', 'DEL RIO · #4', 'MAGS · #9', 'OTTO · #12', 'YOU · #1']);
    expect(new Set(driverCells().map((c) => c.split(' · ')[0]))).toEqual(new Set(ROSTER.map((d) => d.name)));
  });

  it('AC7: without driver names the table keeps the generic YOU / CPU labels', () => {
    const { ui, driverCells } = setup(2, (drivers) => ({ trackName: 'Dust Bowl', carNumbers: drivers.map((d) => d.number) }));
    ui.sync(finished([racer({ finishTick: 7300, position: 2 }), racer({ finishTick: 7200, position: 1 })]), []);
    expect(driverCells()).toEqual(['CPU · #7', 'YOU · #1']);
  });
});
