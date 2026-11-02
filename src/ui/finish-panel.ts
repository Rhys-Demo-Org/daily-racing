// Finish panel: the ink hatch dims the frozen race, then a navy overlay card drops in with
// FINISHED, the final time, the best lap chip and a RACE AGAIN button (existing components only;
// the full results screen is backlog B02).
import './components.css';
import './screens.css';
import { button, h, hatch, overlay, type Overlay } from './dom.ts';
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
