// Touch-control visual state machine (UI_RULES §6), pure logic with an injected clock.
//
//   wake() (race start / resume) → every control 'active'
//   active, untouched for restAfterMs → 'resting' (hollow)
//   press → 'pressed' (mustard, sunk); release → 'active' again for another restAfterMs
import { tokens } from '@tokens';
import type { TouchControlId, TouchListener } from '../input/touch.ts';
import { TOUCH_CONTROL_IDS } from '../input/touch.ts';

export type TouchVisual = 'active' | 'resting' | 'pressed';

export interface TouchStateOptions {
  /** Clock in ms. Default: performance.now. */
  now?: () => number;
  /** Idle time before a control rests. Default: tokens.touch.restAfterMs (4 s). */
  restAfterMs?: number;
}

export interface TouchStateMachine extends TouchListener {
  /** Race start or resume: every control becomes active. */
  wake(): void;
  state(id: TouchControlId): TouchVisual;
  states(): Record<TouchControlId, TouchVisual>;
  /** Clock time of the next active → resting change, or null if nothing will change on its own. */
  nextChangeAt(): number | null;
  /** Called after press, release and wake. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

export function createTouchStateMachine(opts: TouchStateOptions = {}): TouchStateMachine {
  const now = opts.now ?? (() => performance.now());
  const restAfter = opts.restAfterMs ?? tokens.touch.restAfterMs;
  // Controls start resting until the race wakes them.
  const lastActive: Record<TouchControlId, number> = { left: -Infinity, right: -Infinity, gas: -Infinity, brake: -Infinity };
  const pressed: Record<TouchControlId, boolean> = { left: false, right: false, gas: false, brake: false };
  const subs = new Set<() => void>();
  const notify = (): void => subs.forEach((fn) => fn());

  const state = (id: TouchControlId): TouchVisual => {
    if (pressed[id]) return 'pressed';
    return now() - lastActive[id] < restAfter ? 'active' : 'resting';
  };

  return {
    wake() {
      const t = now();
      for (const id of TOUCH_CONTROL_IDS) lastActive[id] = t;
      notify();
    },
    press(id) {
      pressed[id] = true;
      lastActive[id] = now();
      notify();
    },
    release(id) {
      if (!pressed[id]) return;
      pressed[id] = false;
      lastActive[id] = now();
      notify();
    },
    state,
    states: () => ({ left: state('left'), right: state('right'), gas: state('gas'), brake: state('brake') }),
    nextChangeAt() {
      let next: number | null = null;
      for (const id of TOUCH_CONTROL_IDS) {
        if (state(id) !== 'active') continue;
        const at = lastActive[id] + restAfter;
        if (next === null || at < next) next = at;
      }
      return next;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
