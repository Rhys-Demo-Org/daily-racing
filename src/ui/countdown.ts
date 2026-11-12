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

/**
 * Seconds the camera takes to glide back onto the player once GO! has gone: long enough to read as
 * an unhurried pan rather than a snap.
 */
export const GO_GLIDE_SECONDS = 1.4;

/**
 * Share (1 → 0) of the countdown framing to apply (the scene's `framing`): 1 while the countdown is
 * on screen (raceTick is 0 until GO), then a smoothstep to 0 over GO_GLIDE_SECONDS, so the camera
 * eases out and settles gently.
 */
export function countdownFraming(view: Pick<RaceView, 'raceTick'>): number {
  const t = Math.min(Math.max((view.raceTick - GO_GONE_TICKS) / TICK_HZ / GO_GLIDE_SECONDS, 0), 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Half the widest roundel's width, CSS px: GO!, whose three glyphs set ≈ 1.27 em of the countdown
 * size (measured in Chromium), taken as 1.3, plus s5 padding each side. Numbers are narrower.
 */
export const COUNTDOWN_HALF_WIDTH = (1.3 * tokens.typeScale.countdown.mobile + 2 * tokens.space.s5) / 2;

/** How far the camera must keep the player car off the screen centre: COUNTDOWN_HALF_WIDTH while it is on screen, else 0. */
export const countdownClearance = (view: Pick<RaceView, 'phase' | 'raceTick'>): number => (countdownOnScreen(view) ? COUNTDOWN_HALF_WIDTH : 0);

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
