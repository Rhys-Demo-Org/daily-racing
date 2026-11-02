// Finish panel: the ink hatch dims the frozen race, then a navy overlay card drops in with
// FINISHED, the final time, the best lap chip, the drivers by position (when known) and a RACE
// AGAIN button (existing components only; the full results screen is backlog B02).
import { tokens } from '@tokens';
import './components.css';
import './screens.css';
import { button, h, overlay, s, type Overlay } from './dom.ts';
import { formatOptionalTime, formatTime } from './format.ts';
import { icon } from './icons.ts';
import type { DriverLabel } from './types.ts';

export interface FinishPanelOptions {
  onRaceAgain: () => void;
}

export interface FinishResult {
  /** Final race time in ms. */
  timeMs: number;
  /** Best lap in ms, or null. */
  bestLapMs: number | null;
  /** Drivers in finishing (race-position) order; empty or absent shows no list. */
  standings?: readonly DriverLabel[];
}

/** "KOSKI · #7". */
export const driverText = (d: DriverLabel): string => `${d.name} · #${d.number}`;

export interface FinishPanel extends Omit<Overlay, 'show'> {
  show(result: FinishResult): void;
}

let hatchIds = 0;

/** Full-screen hatch of 3px ink lines every 9px at 45° (UI_RULES §7), as an SVG pattern. */
function hatch(): SVGSVGElement {
  const id = `ui-hatch-${++hatchIds}`;
  const { lineWidth, pitch, angle } = tokens.hatch;
  return s('svg', { class: 'ui-hatch', 'aria-hidden': 'true' }, [
    s('defs', {}, [
      s('pattern', { id, width: pitch, height: pitch, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${angle})` }, [
        s('rect', { class: 'ui-hatch__line', width: lineWidth, height: pitch }),
      ]),
    ]),
    s('rect', { width: '100%', height: '100%', fill: `url(#${id})` }),
  ]);
}

export function createFinishPanel(root: HTMLElement, opts: FinishPanelOptions): FinishPanel {
  const time = h('span', 'ui-value');
  const best = h('span', 'ui-value');
  const drivers = h('ol', 'ui-finish__drivers', [], { 'aria-label': 'Results' });
  const again = button('ui-button--primary', [icon('restart'), 'Race again'], opts.onRaceAgain);
  const card = h(
    'div',
    'ui-panel ui-panel--navy ui-panel--overlay ui-finish__card',
    [
      h('h2', 'ui-display', ['Finished']),
      h('div', 'ui-finish__stats', [
        h('div', 'ui-finish__stat', [h('span', 'ui-label', ['Time']), time]),
        h('div', 'ui-panel ui-panel--mustard ui-finish__stat', [h('span', 'ui-label', ['Best lap']), best]),
      ]),
      drivers,
      again,
    ],
    { role: 'dialog', 'aria-label': 'Finished' },
  );
  const screen = overlay(root, 'ui-finish', [hatch(), card], again);

  return {
    ...screen,
    show(result) {
      time.textContent = formatTime(result.timeMs);
      best.textContent = formatOptionalTime(result.bestLapMs);
      const standings = result.standings ?? [];
      drivers.replaceChildren(...standings.map((d) => h('li', 'ui-label ui-finish__driver', [driverText(d)])));
      drivers.hidden = standings.length === 0;
      screen.show();
    },
  };
}
