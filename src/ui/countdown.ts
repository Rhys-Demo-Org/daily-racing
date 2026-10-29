// Countdown (mockup S3, board 05 #4): a roundel drops onto the table for 3, 2, 1, then a GO! stamp
// that holds and slides up and off. Start lights below pop on one per beat. The game loop calls
// show() from sim state every frame; repeated calls with the same value do nothing.
import './components.css';
import './countdown.css';
import { h } from './dom.ts';

export type CountdownStep = 3 | 2 | 1 | 0;

export interface Countdown {
  readonly element: HTMLElement;
  /** Shows 3, 2 or 1, or GO! for 0. */
  show(step: CountdownStep): void;
  hide(): void;
  /** The step on screen, or null when hidden. */
  readonly current: CountdownStep | null;
  destroy(): void;
}

/** Roundel modifier per step: red 3, mustard 2, cream 1, grass GO! (board 02). */
const STEP_CLASS: Record<CountdownStep, string> = { 3: 'ui-cd-roundel--3', 2: 'ui-cd-roundel--2', 1: 'ui-cd-roundel--1', 0: 'ui-cd-roundel--go' };
/** Lights lit at each step: one more per beat. */
const LIT: Record<CountdownStep, number> = { 3: 1, 2: 2, 1: 3, 0: 4 };

export function createCountdown(root: HTMLElement): Countdown {
  const stage = h('div', 'ui-cd-stage');
  const lights = [0, 1, 2, 3].map((i) => h('span', `ui-cd-light ui-cd-light--${i}`));
  const lightRow = h('div', 'ui-cd-lights', lights);
  lightRow.setAttribute('aria-hidden', 'true');
  const element = h('div', 'ui-layer ui-countdown', [stage, lightRow]);
  element.setAttribute('role', 'status');
  element.hidden = true;
  root.append(element);

  let current: CountdownStep | null = null;

  return {
    element,
    show(step) {
      if (step === current) return;
      const prevLit = current === null ? 0 : LIT[current];
      current = step;
      element.hidden = false;
      element.classList.toggle('is-go', step === 0);
      // A fresh roundel per beat restarts its drop animation without reflow tricks.
      const roundel = h('div', `ui-cd-roundel ${STEP_CLASS[step]}`, [step === 0 ? 'Go!' : String(step)]);
      roundel.setAttribute('aria-label', step === 0 ? 'Go' : `Countdown: ${step}`);
      stage.replaceChildren(roundel);
      lights.forEach((light, i) => {
        const lit = i < LIT[step];
        light.classList.toggle('is-lit', lit);
        // Only the newly lit light pops (each light pops once per countdown).
        light.classList.toggle('is-popping', lit && i >= prevLit);
      });
    },
    hide() {
      current = null;
      element.hidden = true;
      element.classList.remove('is-go');
      stage.replaceChildren();
      for (const light of lights) light.classList.remove('is-lit', 'is-popping');
    },
    get current() {
      return current;
    },
    destroy() {
      element.remove();
    },
  };
}
