// Countdown (mockup S3, board 05 #4): a roundel drops onto the table for 3, 2, 1, then a GO! stamp
// that holds and slides up and off. Start lights below pop on one per beat. The game loop calls
// show() from sim state every frame; repeated calls with the same value do nothing.
import { tokens } from '@tokens';
import { TICK_HZ, type RaceView } from '../sim/types.ts';
import './components.css';
import './countdown.css';
import { h } from './dom.ts';

const MS = tokens.motion.durationMs;
/**
 * Time from GO until GO! has left the screen: it lands (stamp), holds (3 slides; countdown.css
 * --ui-cd-go-hold) and slides off (slide). With reduced motion it cuts at the end of the hold, sooner.
 */
export const GO_GONE_MS = MS.stamp + MS.slide * 3 + MS.slide;
/** GO_GONE_MS in whole sim ticks, rounded up. */
export const GO_GONE_TICKS = Math.ceil((GO_GONE_MS * TICK_HZ) / 1000);

/** True while the countdown covers the screen centre: 3, 2, 1, then GO! until it has gone. */
export function countdownOnScreen(view: Pick<RaceView, 'phase' | 'raceTick'>): boolean {
  return view.phase === 'countdown' || view.raceTick < GO_GONE_TICKS;
}

export type CountdownStep = 3 | 2 | 1 | 0;

export interface Countdown {
  readonly element: HTMLElement;
  /** Shows 3, 2 or 1, or GO! for 0. */
  show(step: CountdownStep): void;
  hide(): void;
  /** The step on screen, or null when hidden. */
  readonly current: CountdownStep | null;
}

/** Roundel modifier per step: red 3, mustard 2, cream 1, grass GO! (board 02). */
const STEP_CLASS: Record<CountdownStep, string> = { 3: 'ui-cd-roundel--3', 2: 'ui-cd-roundel--2', 1: 'ui-cd-roundel--1', 0: 'ui-cd-roundel--go' };
/** Lights lit at each step: one more per beat. */
const LIT: Record<CountdownStep, number> = { 3: 1, 2: 2, 1: 3, 0: 4 };

export function createCountdown(root: HTMLElement): Countdown {
  const stage = h('div', 'ui-cd-stage');
  const lights = [0, 1, 2, 3].map((i) => h('span', `ui-cd-light ui-cd-light--${i}`));
  const element = h('div', 'ui-layer ui-countdown', [stage, h('div', 'ui-cd-lights', lights, { 'aria-hidden': 'true' })], { role: 'status', hidden: '' });
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
      stage.replaceChildren(
        h('div', `ui-panel ui-panel--overlay ui-cd-roundel ${STEP_CLASS[step]}`, [step === 0 ? 'Go!' : String(step)], {
          'aria-label': step === 0 ? 'Go' : `Countdown: ${step}`,
        }),
      );
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
  };
}
