// Pause screen (mockup S4): the ink hatch wipes in over the frozen race, then a cream overlay card
// drops in with a navy PAUSED header ("LAP x/3 · m:ss.cc"), the triple stripe and three buttons:
// RESUME (rally-red, focused), RESTART RACE (cream) and QUIT TO MENU (navy).
import './components.css';
import './screens.css';
import { button, h, hatch, overlay, type Overlay } from './dom.ts';
import { formatTime } from './format.ts';
import { icon } from './icons.ts';

export interface PauseScreenOptions {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export interface PauseInfo {
  lap: number;
  laps: number;
  /** Race time in ms (null before GO reads 0:00.00, as on the HUD). */
  timeMs: number | null;
}

export interface PauseScreen extends Omit<Overlay, 'show'> {
  show(info: PauseInfo): void;
}

export function createPauseScreen(root: HTMLElement, opts: PauseScreenOptions): PauseScreen {
  const status = h('span', 'ui-label ui-pause__status');
  const resume = button('ui-button--primary', [icon('play'), 'Resume'], opts.onResume);
  const card = h(
    'div',
    'ui-panel ui-panel--cream ui-panel--overlay ui-pause__card',
    [
      h('div', 'ui-pause__header', [h('h2', 'ui-pause__title', ['Paused']), status]),
      h('div', 'ui-stripes ui-pause__stripes', [h('span', 'ui-stripe ui-stripe--red'), h('span', 'ui-stripe ui-stripe--mustard'), h('span', 'ui-stripe ui-stripe--cream')]),
      h('div', 'ui-pause__buttons', [
        resume,
        button('', [icon('restart'), 'Restart race'], opts.onRestart),
        button('ui-button--navy', [icon('home'), 'Quit to menu'], opts.onQuit),
      ]),
    ],
    { role: 'dialog', 'aria-label': 'Paused' },
  );
  const screen = overlay(root, 'ui-pause', [hatch(), card], resume);

  return {
    ...screen,
    show(info) {
      status.textContent = `LAP ${info.lap}/${info.laps} · ${formatTime(info.timeMs ?? 0)}`;
      screen.show();
    },
  };
}
