// Finish panel: the ink hatch dims the frozen race, then a navy overlay card drops in with
// FINISHED, the final time, the best lap chip and a RACE AGAIN button (existing components only;
// the full results screen is backlog B02).
import { tokens } from '@tokens';
import './components.css';
import './screens.css';
import { button, h, overlay, s, type Overlay } from './dom.ts';
import { formatOptionalTime, formatTime } from './format.ts';
import { icon } from './icons.ts';

export interface FinishPanelOptions {
  onRaceAgain: () => void;
}

export interface FinishResult {
  /** Final race time in ms. */
  timeMs: number;
  /** Best lap in ms, or null. */
  bestLapMs: number | null;
}

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
      screen.show();
    },
  };
}
