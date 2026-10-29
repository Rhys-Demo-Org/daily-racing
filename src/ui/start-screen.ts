// Start screen: solid navy ground, the title in display type, the triple stripe and a big RACE
// button (patterns from S6 and boards 02/05; no track select until backlog B08).
import './components.css';
import './screens.css';
import { h } from './dom.ts';
import { icon } from './icons.ts';

export interface StartScreenOptions {
  onRace: () => void;
  /** Optional caps line under the stripes, e.g. "Dust Bowl · 3 laps". */
  subtitle?: string;
}

export interface StartScreen {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
  destroy(): void;
}

export function createStartScreen(root: HTMLElement, opts: StartScreenOptions): StartScreen {
  const race = h('button', 'ui-button ui-button--primary ui-button--big ui-start__race', ['Race', icon('play')]);
  race.type = 'button';
  race.addEventListener('click', () => opts.onRace());

  const element = h('div', 'ui-layer ui-screen ui-start', [
    h('div', 'ui-start__brand', [
      h('h1', 'ui-start__title', [h('span', 'ui-start__title-top', ['Daily']), h('span', 'ui-start__title-main', ['AI Racer'])]),
      h('div', 'ui-stripes', [h('span', 'ui-stripe ui-stripe--red'), h('span', 'ui-stripe ui-stripe--mustard'), h('span', 'ui-stripe ui-stripe--cream')]),
      ...(opts.subtitle ? [h('p', 'ui-label ui-start__subtitle', [opts.subtitle])] : []),
    ]),
    race,
  ]);
  element.hidden = true;
  root.append(element);

  return {
    element,
    show() {
      element.hidden = false;
      race.focus({ preventScroll: true });
    },
    hide() {
      element.hidden = true;
    },
    destroy() {
      element.remove();
    },
  };
}
