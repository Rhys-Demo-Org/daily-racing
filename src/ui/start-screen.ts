// Start screen: solid navy ground, the title in display type, the triple stripe and a big RACE
// button (patterns from S6 and boards 02/05; no track select until backlog B08).
import './components.css';
import './screens.css';
import { button, h, overlay, type Overlay } from './dom.ts';
import { icon } from './icons.ts';

export interface StartScreenOptions {
  onRace: () => void;
  /** Optional caps line under the stripes, e.g. "Dust Bowl · 3 laps". */
  subtitle?: string;
}

export type StartScreen = Overlay;

export function createStartScreen(root: HTMLElement, opts: StartScreenOptions): StartScreen {
  const race = button('ui-button--primary ui-button--big', ['Race', icon('play')], opts.onRace);
  return overlay(
    root,
    'ui-start',
    [
      h('div', 'ui-start__brand', [
        h('h1', 'ui-display ui-start__title', [h('span', 'ui-start__title-top', ['Daily']), h('span', '', ['AI Racer'])]),
        h('div', 'ui-stripes', [h('span', 'ui-stripe ui-stripe--red'), h('span', 'ui-stripe ui-stripe--mustard'), h('span', 'ui-stripe ui-stripe--cream')]),
        ...(opts.subtitle ? [h('p', 'ui-label ui-start__subtitle', [opts.subtitle])] : []),
      ]),
      race,
    ],
    race,
  );
}
