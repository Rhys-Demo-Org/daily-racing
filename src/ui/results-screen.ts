// Results screen (S5): a full-screen menu on a solid navy ground with the triple stripe, the race
// label and track name, the player's placing roundel, the best-lap chip, the results table (rows
// dealt 40ms apart, the player's row in rally-red) and RETRY / NEXT RACE.
import './components.css';
import './screens.css';
import './results.css';
import { TICK_HZ } from '../sim/types.ts';
import { button, h, overlay, type Overlay } from './dom.ts';
import { formatGap, formatOptionalTime, formatTime, NO_TIME, ordinal } from './format.ts';
import { icon } from './icons.ts';

export interface ResultsScreenOptions {
  onRaceAgain: () => void;
  onNextRace: () => void;
}

/** What the screen needs to know about the race, fixed when it opens. */
export interface ResultsRace {
  laps: number;
  trackName: string;
  /** Livery numbers, index-aligned with the cars (0 = player). */
  carNumbers: readonly number[];
  /** The player's best lap in ms, or null. */
  bestLapMs: number | null;
}

/** One car's standing; index-aligned with the cars. */
export interface ResultRacer {
  finishTick: number | null;
  position: number;
}

export interface ResultsScreen extends Omit<Overlay, 'show'> {
  show(race: ResultsRace, racers: readonly ResultRacer[]): void;
  /** Fills in cars that finish after the screen opened; touches no DOM if nothing changed. */
  update(racers: readonly ResultRacer[]): void;
}

interface Row {
  element: HTMLElement;
  pos: HTMLElement;
  driver: HTMLElement;
  time: HTMLElement;
  gap: HTMLElement;
}

const PLAYER_ROW = 'ui-results__row--player';
const ticksToMs = (ticks: number): number => (ticks * 1000) / TICK_HZ;

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Table order: finished cars by finish tick, then the rest by race position, ties by car index. */
function finishingOrder(racers: readonly ResultRacer[]): number[] {
  const key = (r: ResultRacer): number => (r.finishTick === null ? Infinity : r.finishTick);
  return racers
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = racers[a] as ResultRacer;
      const rb = racers[b] as ResultRacer;
      return key(ra) - key(rb) || ra.position - rb.position || a - b;
    });
}

export function createResultsScreen(root: HTMLElement, opts: ResultsScreenOptions): ResultsScreen {
  const label = h('p', 'ui-label ui-results__label');
  const trackName = h('h2', 'ui-display ui-results__track');
  let roundel = h('div', 'ui-results__roundel');
  const best = h('span', 'ui-value');
  const body = h('div', 'ui-results__body', [], { role: 'rowgroup' });
  const cell = (text: string): HTMLElement => h('span', 'ui-results__cell', [text], { role: 'columnheader' });
  const retry = button('', [icon('restart'), 'Retry'], opts.onRaceAgain);
  const next = button('ui-button--primary', ['Next race', icon('play')], opts.onNextRace);
  const screen = overlay(
    root,
    'ui-results ui-finish',
    [
      h('div', 'ui-results__head', [
        h('div', 'ui-stripes', [h('span', 'ui-stripe ui-stripe--red'), h('span', 'ui-stripe ui-stripe--mustard'), h('span', 'ui-stripe ui-stripe--cream')]),
        label,
        trackName,
      ]),
      h('div', 'ui-results__main', [
        h('div', 'ui-results__side', [
          roundel,
          h('div', 'ui-panel ui-panel--mustard ui-results__best', [h('span', 'ui-label', ['Best lap']), best]),
        ]),
        h('div', 'ui-results__table', [h('div', 'ui-results__row ui-results__header ui-label', [cell('Pos'), cell('Driver'), cell('Time'), cell('Gap')], { role: 'row' }), body], {
          role: 'table',
          'aria-label': 'Results',
        }),
      ]),
      h('div', 'ui-results__actions', [retry, next]),
    ],
    next,
  );

  let rows: Row[] = [];
  let numbers: readonly number[] = [];
  let ticks: (number | null)[] = [];

  function render(racers: readonly ResultRacer[]): void {
    ticks = racers.map((r) => r.finishTick);
    const order = finishingOrder(racers);
    const leader = racers[order[0] ?? 0]?.finishTick ?? null;
    order.forEach((car, i) => {
      const row = rows[i];
      const finish = racers[car]?.finishTick ?? null;
      if (!row) return;
      setText(row.pos, String(i + 1));
      setText(row.driver, `${car === 0 ? 'YOU' : 'CPU'} · #${numbers[car] ?? car + 1}`);
      setText(row.time, finish === null ? NO_TIME : formatTime(ticksToMs(finish)));
      setText(row.gap, finish === null || leader === null ? NO_TIME : i === 0 ? '–' : formatGap(ticksToMs(finish - leader)));
      row.element.classList.toggle(PLAYER_ROW, car === 0);
    });
    setText(roundel, ordinal(order.indexOf(0) + 1));
  }

  return {
    ...screen,
    show(race, racers) {
      numbers = race.carNumbers;
      label.textContent = `Race complete · ${race.laps} laps`;
      trackName.textContent = race.trackName;
      best.textContent = formatOptionalTime(race.bestLapMs);
      rows = racers.map((_, i) => {
        const td = (): HTMLElement => h('span', 'ui-results__cell', [], { role: 'cell' });
        // The deal stagger is the only inline style: a custom property the CSS multiplies by 40ms.
        const row = { element: h('div', 'ui-panel ui-results__row', [], { role: 'row', style: `--ui-deal-index: ${i}` }), pos: td(), driver: td(), time: td(), gap: td() };
        row.element.append(row.pos, row.driver, row.time, row.gap);
        return row;
      });
      body.replaceChildren(...rows.map((r) => r.element));
      // A fresh roundel per race, told how many rows it waits for before it stamps.
      const stamp = h('div', 'ui-results__roundel', [], { style: `--ui-deal-count: ${rows.length}` });
      roundel.replaceWith(stamp);
      roundel = stamp;
      render(racers);
      screen.show();
    },
    update(racers) {
      if (racers.length === ticks.length && racers.every((r, i) => r.finishTick === ticks[i])) return;
      render(racers);
    },
  };
}
