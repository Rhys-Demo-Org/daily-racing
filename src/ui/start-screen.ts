// Start screen (S6): a navy title panel (DAILY AI RACER, the triple stripe, the #1 car) beside a
// dirt ground with SELECT TRACK, one radio card per track (the selected one mustard) and RACE.
// Cards are radios, not buttons, so RACE is the screen's first, focused button. A locked card can be
// focused but never selected: clicks, arrows and select() pass over it.
import './components.css';
import './screens.css';
import './title.css';
import { localBestLaps, type BestLapStore } from './best-laps.ts';
import { button, h, overlay, stripes, type Overlay } from './dom.ts';
import { icon } from './icons.ts';
import { watchDesktop } from './layout.ts';
import { titleCar } from './title-car.ts';
import { createTrackCard } from './track-card.ts';
import type { TrackCardView, TrackLocked } from './types.ts';

export interface StartScreenOptions {
  onRace: () => void;
  /** Optional caps line under the stripes, e.g. "Dust Bowl · 3 laps". */
  subtitle?: string;
  /** The tracks to pick from, in registry order; the first unlocked one is selected until select() is called. */
  tracks?: readonly TrackCardView[];
  /** Where the cards read each track's best lap (default: localStorage). Read on every show(). */
  bestLaps?: BestLapStore;
  /** Which tracks are locked (default: none). Asked on every show() and select(). */
  locked?: TrackLocked;
}

export interface StartScreen extends Overlay {
  /** The selected track's id (null with no tracks). */
  selected(): string | null;
  /** Selects the card of `trackId`, if there is one and it isn't locked. */
  select(trackId: string): void;
}

export function createStartScreen(root: HTMLElement, opts: StartScreenOptions): StartScreen {
  const bestLaps = opts.bestLaps ?? localBestLaps;
  const locked = opts.locked ?? ((): boolean => false);
  const race = button('ui-button--primary ui-button--big ui-start__race', ['Race', icon('play')], opts.onRace);
  const cards = (opts.tracks ?? []).map((t) => createTrackCard(t, () => pick(t.id, true)));
  refresh();
  let selected: string | null = cards.find((c) => !c.locked)?.id ?? null;

  function pick(id: string, focus: boolean): void {
    if (cards.find((c) => c.id === id)?.locked !== false) return;
    selected = id;
    for (const card of cards) {
      card.setSelected(card.id === id);
      if (focus && card.id === id) card.element.focus({ preventScroll: true });
    }
  }

  /** Re-reads every card's lock and stored best. */
  function refresh(): void {
    for (const card of cards) {
      card.setLocked(locked(card.id));
      card.setBest(bestLaps.read(card.id));
    }
  }

  const group = h(
    'div',
    'ui-start__cards',
    cards.map((c) => c.element),
    { role: 'radiogroup', 'aria-label': 'Select track' },
  );
  // Arrow keys move the selection along the unlocked cards, wrapping at the ends (radiogroup pattern).
  // Modified arrows are browser shortcuts (Alt+← = Back), as in src/input/keyboard.ts.
  group.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const i = cards.findIndex((c) => c.id === selected);
    if (step === undefined || i < 0) return;
    e.preventDefault();
    for (let k = 1; k < cards.length; k++) {
      const next = cards[(i + step * k + cards.length * k) % cards.length];
      if (next && !next.locked) return pick(next.id, true);
    }
  });

  const screen = overlay(
    root,
    'ui-start',
    [
      h('div', 'ui-start__brand', [
        h('h1', 'ui-display ui-start__title', [h('span', 'ui-start__title-top', ['Daily']), h('span', '', ['AI Racer'])]),
        stripes('ui-start__stripes'),
        ...(opts.subtitle ? [h('p', 'ui-label ui-start__subtitle', [opts.subtitle])] : []),
        titleCar(),
      ]),
      h('div', 'ui-start__select', [h('h2', 'ui-start__label', ['SELECT TRACK']), group, race]),
    ],
    race,
  );
  // Desktop sizes, margins and outlines are CSS under .is-desktop (UI_RULES §5), as in the HUD.
  watchDesktop((desktop) => screen.element.classList.toggle('is-desktop', desktop));
  if (selected !== null) pick(selected, false);

  return {
    ...screen,
    show() {
      refresh();
      // A selected card that has just become locked hands the selection to the first unlocked one.
      if (cards.find((c) => c.id === selected)?.locked) {
        const first = cards.find((c) => !c.locked);
        if (first) pick(first.id, false);
      }
      screen.show();
    },
    selected: () => selected,
    select(trackId) {
      const card = cards.find((c) => c.id === trackId);
      if (card) card.setLocked(locked(trackId));
      pick(trackId, false);
    },
  };
}
