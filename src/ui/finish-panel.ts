// Finish panel: the ink hatch dims the frozen race, then a navy overlay card drops in with
// FINISHED, the final time, the best lap chip and a RACE AGAIN button (existing components only;
// the full results screen is backlog B02).
import { tokens } from '@tokens';
import './components.css';
import './screens.css';
import { h, s, setText } from './dom.ts';
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

export interface FinishPanel {
  readonly element: HTMLElement;
  show(result: FinishResult): void;
  hide(): void;
  destroy(): void;
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
  const time = h('span', 'ui-finish__value');
  const best = h('span', 'ui-finish__value');
  const again = h('button', 'ui-button ui-button--primary ui-finish__again', [icon('restart'), 'Race again']);
  again.type = 'button';
  again.addEventListener('click', () => opts.onRaceAgain());

  const card = h('div', 'ui-finish__card', [
    h('h2', 'ui-finish__title', ['Finished']),
    h('div', 'ui-finish__stats', [
      h('div', 'ui-finish__stat', [h('span', 'ui-label', ['Time']), time]),
      h('div', 'ui-panel ui-panel--mustard ui-finish__best', [h('span', 'ui-label', ['Best lap']), best]),
    ]),
    again,
  ]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Finished');
  const element = h('div', 'ui-layer ui-screen ui-finish', [hatch(), card]);
  element.hidden = true;
  root.append(element);

  return {
    element,
    show(result) {
      setText(time, formatTime(result.timeMs));
      setText(best, formatOptionalTime(result.bestLapMs));
      element.hidden = false;
      again.focus({ preventScroll: true });
    },
    hide() {
      element.hidden = true;
    },
    destroy() {
      element.remove();
    },
  };
}
