// On-screen touch controls (S1–S2, UI_RULES §6): steer pads bottom-left, GAS + BRAKE bottom-right.
// Visual state comes from the pure state machine in touch-state.ts; pointer handling lives in
// src/input/touch.ts, which reads zones() from here and notifies the state machine.
import { tokens } from '@tokens';
import type { TouchControlId, TouchZone } from '../input/touch.ts';
import { TOUCH_CONTROL_IDS } from '../input/touch.ts';
import './components.css';
import './touch-controls.css';
import { h, prefersReducedMotion } from './dom.ts';
import { icon } from './icons.ts';
import { createTouchStateMachine, type TouchStateMachine, type TouchStateOptions, type TouchVisual } from './touch-state.ts';

export interface TouchControlsOptions extends TouchStateOptions {
  /** Force visibility; by default shown on coarse pointers or after the first touch. */
  visible?: boolean;
}

export interface TouchControls {
  readonly element: HTMLElement;
  /** State machine; pass it to createInput as the touch listener. */
  readonly machine: TouchStateMachine;
  /** Drawn shapes in client px (empty while hidden), for the input hit test. */
  zones(): TouchZone[];
  /** Race start or resume: every control wakes for 4 s. */
  wake(): void;
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  destroy(): void;
}

const LABELS: Record<TouchControlId, string> = {
  left: 'Steer left',
  right: 'Steer right',
  gas: 'Accelerate',
  brake: 'Brake or reverse',
};

/** True on devices whose primary pointer is a finger. */
export function isCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export function createTouchControls(root: HTMLElement, opts: TouchControlsOptions = {}): TouchControls {
  const machine = createTouchStateMachine(opts);
  const now = opts.now ?? (() => performance.now());

  const slots = {} as Record<TouchControlId, HTMLElement>;
  const buttons = {} as Record<TouchControlId, HTMLButtonElement>;
  for (const id of TOUCH_CONTROL_IDS) {
    const b = h('button', `ui-tc ui-tc--${id} is-resting`);
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('aria-label', LABELS[id]);
    if (id === 'left') b.append(icon('arrow-left', 'ui-tc__icon'));
    else if (id === 'right') b.append(icon('arrow-right', 'ui-tc__icon'));
    else b.append(id === 'gas' ? 'Gas' : 'Brake');
    buttons[id] = b;
    slots[id] = h('div', `ui-touch__slot ui-touch__slot--${id}`, [b]);
  }
  const element = h('div', 'ui-layer ui-touch', TOUCH_CONTROL_IDS.map((id) => slots[id]));
  root.append(element);

  // What each button currently shows, including the short 'retracting' step before resting.
  const shown: Record<TouchControlId, TouchVisual | 'retracting'> = { left: 'resting', right: 'resting', gas: 'resting', brake: 'resting' };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let restTimer: ReturnType<typeof setTimeout> | null = null;

  const later = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  function show(id: TouchControlId, v: TouchVisual | 'retracting', waking = false): void {
    shown[id] = v;
    const b = buttons[id];
    b.classList.remove('is-active', 'is-resting', 'is-pressed', 'is-retracting', 'is-waking');
    b.classList.add(`is-${v}`);
    if (waking) {
      b.classList.add('is-waking');
      later(() => b.classList.remove('is-waking'), tokens.motion.durationMs.release);
    }
  }

  function sync(): void {
    const reduced = prefersReducedMotion();
    for (const id of TOUCH_CONTROL_IDS) {
      const next = machine.state(id);
      const cur = shown[id];
      if (next === cur || (next === 'resting' && cur === 'retracting')) continue;
      if (next === 'resting' && !reduced) {
        // Rest: the shadow retracts first (160ms), then the fill cuts to hollow.
        show(id, 'retracting');
        later(() => {
          if (shown[id] === 'retracting') show(id, 'resting');
        }, tokens.motion.durationMs.stamp);
      } else {
        // Wake from resting pops 0.9 → 1 as the shadow grows back.
        show(id, next, next === 'active' && (cur === 'resting' || cur === 'retracting') && !reduced);
      }
    }
    if (restTimer !== null) clearTimeout(restTimer);
    restTimer = null;
    const at = machine.nextChangeAt();
    if (at !== null) restTimer = setTimeout(sync, Math.max(0, at - now()));
  }

  const unsubscribe = machine.subscribe(sync);

  let visible = false;
  const setVisible = (v: boolean): void => {
    visible = v;
    element.hidden = !v;
  };
  setVisible(opts.visible ?? isCoarsePointer());

  // Any touch reveals the controls (touch laptops report a fine primary pointer).
  const onTouch = (e: Event): void => {
    if (e.type === 'touchstart' || (e as PointerEvent).pointerType === 'touch') setVisible(true);
  };
  const autoShow = opts.visible === undefined && typeof window !== 'undefined';
  if (autoShow) {
    window.addEventListener('touchstart', onTouch, { passive: true, capture: true });
    window.addEventListener('pointerdown', onTouch, { capture: true });
  }

  return {
    element,
    machine,
    zones() {
      if (!visible) return [];
      return TOUCH_CONTROL_IDS.map((id): TouchZone => {
        const r = slots[id].getBoundingClientRect();
        return id === 'left' || id === 'right'
          ? { id, shape: 'rect', left: r.left, top: r.top, width: r.width, height: r.height }
          : { id, shape: 'circle', cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
      });
    },
    wake: () => machine.wake(),
    setVisible,
    get visible() {
      return visible;
    },
    destroy() {
      unsubscribe();
      if (restTimer !== null) clearTimeout(restTimer);
      timers.forEach(clearTimeout);
      if (autoShow) {
        window.removeEventListener('touchstart', onTouch, { capture: true });
        window.removeEventListener('pointerdown', onTouch, { capture: true });
      }
      element.remove();
    },
  };
}
