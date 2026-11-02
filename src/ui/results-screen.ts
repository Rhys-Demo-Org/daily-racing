// Results screen (S5): a full-screen menu on a solid navy ground with the triple stripe, the race
// label and track name, the player's placing roundel, the best-lap chip, the results table (rows
// dealt 40ms apart, the player's row in rally-red, then the roundel stamps) and RETRY / NEXT RACE.
import './components.css';
import './screens.css';
import './results.css';
import type { RacerView } from '../sim/types.ts';
import { button, h, overlay, stripes, type Overlay } from './dom.ts';
import { formatGap, formatOptionalTime, formatTime, NO_TIME, ordinal, ticksToMs } from './format.ts';
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

/** One car's standing, index-aligned with the cars. Table order is the sim's `position`: finished
 * cars by finish tick, then the rest by race distance, ties to the lower car index. */
export type ResultRacer = Pick<RacerView, 'finishTick' | 'position'>;

export interface ResultsScreen extends Omit<Overlay, 'show'> {
  show(race: ResultsRace, racers: readonly ResultRacer[]): void;
  /** Fills in cars that finish (or change places) after the screen opened; no DOM work if nothing changed. */
  update(racers: readonly ResultRacer[]): void;
}

interface Row {
  element: HTMLElement;
  pos: HTMLElement;
  driver: HTMLElement;
  time: HTMLElement;
  gap: HTMLElement;
}

const LEADER_GAP = '–';

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createResultsScreen(root: HTMLElement, opts: ResultsScreenOptions): ResultsScreen {
  const label = h('p', 'ui-label ui-results__label');
  const trackName = h('h2', 'ui-display ui-results__track');
  let roundel = h('div');
  const best = h('span', 'ui-value');
  const body = h('div', 'ui-results__rows', [], { role: 'rowgroup' });
  const th = (text: string): HTMLElement => h('span', '', [text], { role: 'columnheader' });
  const header = h('div', 'ui-label ui-results__row ui-results__header', [th('Pos'), th('Driver'), th('Time'), th('Gap')], { role: 'row' });
  const next = button('ui-button--primary', ['Next race', icon('play')], opts.onNextRace);
  const screen = overlay(
    root,
    'ui-results ui-finish',
    [
      h('div', 'ui-results__column', [stripes(), label, trackName]),
      h('div', 'ui-results__main', [
        h('div', 'ui-results__column', [roundel, h('div', 'ui-panel ui-panel--mustard ui-results__best', [h('span', 'ui-label', ['Best lap']), best])]),
        h('div', 'ui-results__rows', [header, body], { role: 'table', 'aria-label': 'Results' }),
      ]),
      h('div', 'ui-results__actions', [button('', [icon('restart'), 'Retry'], opts.onRaceAgain), next]),
    ],
    next,
  );

  let rows: Row[] = [];
  let numbers: readonly number[] = [];
  // finishTick and position per car as last rendered, so frames where nothing changed skip render().
  let ticks: (number | null)[] = [];
  let places: number[] = [];

  function render(racers: readonly ResultRacer[]): void {
    ticks = racers.map((r) => r.finishTick);
    places = racers.map((r) => r.position);
    const order = racers.map((_, i) => i).sort((a, b) => (places[a] ?? 0) - (places[b] ?? 0) || a - b);
    const leader = ticks[order[0] ?? 0] ?? null;
    order.forEach((car, i) => {
      const row = rows[i];
      if (!row) return;
      const finish = ticks[car] ?? null;
      setText(row.pos, String(i + 1));
      setText(row.driver, `${car === 0 ? 'YOU' : 'CPU'} · #${numbers[car] ?? car + 1}`);
      setText(row.time, finish === null ? NO_TIME : formatTime(ticksToMs(finish)));
      setText(row.gap, finish === null || leader === null ? NO_TIME : i === 0 ? LEADER_GAP : formatGap(ticksToMs(finish - leader)));
      row.element.classList.toggle('ui-results__row--player', car === 0);
    });
    setText(roundel, ordinal(places[0] ?? 1));
  }

  return {
    ...screen,
    show(race, racers) {
      numbers = race.carNumbers;
      label.textContent = `Race complete · ${race.laps} ${race.laps === 1 ? 'lap' : 'laps'}`;
      trackName.textContent = race.trackName;
      best.textContent = formatOptionalTime(race.bestLapMs);
      // Rows, and the roundel that stamps after them, are built per race. Their deal-stagger custom
      // properties are the only inline styles; the CSS multiplies them by 40ms.
      rows = racers.map((_, i) => {
        const [pos, driver, time, gap] = [0, 1, 2, 3].map(() => h('span', '', [], { role: 'cell' })) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
        const element = h('div', 'ui-panel ui-value ui-results__row', [pos, driver, time, gap], { role: 'row', style: `--ui-deal-index: ${i}` });
        return { element, pos, driver, time, gap };
      });
      body.replaceChildren(...rows.map((r) => r.element));
      const stamp = h('div', 'ui-value ui-results__roundel', [], { style: `--ui-deal-count: ${rows.length}` });
      roundel.replaceWith(stamp);
      roundel = stamp;
      render(racers);
      screen.show();
    },
    update(racers) {
      const same = racers.length === ticks.length && racers.every((r, i) => r.finishTick === ticks[i] && r.position === places[i]);
      if (!same) render(racers);
    },
  };
}
