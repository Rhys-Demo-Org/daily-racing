// On-screen touch controls (S1–S2, UI_RULES §6): steer pads bottom-left, GAS + BRAKE bottom-right.
// Visual state comes from the pure state machine in touch-state.ts; pointer handling lives in
// src/input/touch.ts, which reads zones() from here and notifies the state machine.
import { tokens } from '@tokens';
import { TOUCH_CONTROL_IDS, type TouchControlId, type TouchZone } from '../input/touch.ts';
import './components.css';
import './touch-controls.css';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { createTouchStateMachine, type TouchStateMachine, type TouchStateOptions, type TouchVisual } from './touch-state.ts';

export interface TouchControls {
  readonly element: HTMLElement;
  /** State machine; pass it to createInput as the touch listener. */
  readonly machine: TouchStateMachine;
  /** Drawn shapes in client px (empty while hidden), for the input hit test. */
  zones(): readonly TouchZone[];
  /** Race start or resume: every control wakes for 4 s. */
  wake(): void;
  destroy(): void;
}

const LABELS: Record<TouchControlId, string> = {
  left: 'Steer left',
  right: 'Steer right',
  gas: 'Accelerate',
  brake: 'Brake or reverse',
};

const isPad = (id: TouchControlId): id is 'left' | 'right' => id === 'left' || id === 'right';

/** Shown on touch-first devices, or from the first touch (touch laptops report a fine pointer). */
export function createTouchControls(root: HTMLElement, opts: TouchStateOptions = {}): TouchControls {
  const machine = createTouchStateMachine(opts);
  const slots = {} as Record<TouchControlId, HTMLElement>;
  const buttons = {} as Record<TouchControlId, HTMLButtonElement>;
  for (const id of TOUCH_CONTROL_IDS) {
    const glyph = isPad(id) ? icon(`arrow-${id}`, 'ui-tc__icon') : id === 'gas' ? 'Gas' : 'Brake';
    buttons[id] = h('button', `ui-tc ui-tc--${id} is-resting`, [glyph], { type: 'button', tabindex: '-1', 'aria-label': LABELS[id] });
    slots[id] = h('div', `ui-touch__slot ui-touch__slot--${id}`, [buttons[id]]);
  }
  const element = h('div', 'ui-layer ui-touch', TOUCH_CONTROL_IDS.map((id) => slots[id]));
  element.hidden = !matchMedia('(pointer: coarse)').matches;
  root.append(element);

  // What each button shows, including the short 'retracting' step before resting.
  const shown: Record<TouchControlId, TouchVisual | 'retracting'> = { left: 'resting', right: 'resting', gas: 'resting', brake: 'resting' };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let restTimer: ReturnType<typeof setTimeout> | undefined;

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
    b.className = `ui-tc ui-tc--${id} is-${v}`;
    if (waking) {
      b.classList.add('is-waking');
      later(() => b.classList.remove('is-waking'), tokens.motion.durationMs.release);
    }
  }

  // Reduced motion is CSS only: it cuts the wake pop and shows 'retracting' as resting.
  function sync(): void {
    for (const id of TOUCH_CONTROL_IDS) {
      const next = machine.state(id);
      const cur = shown[id];
      if (next === cur || (next === 'resting' && cur === 'retracting')) continue;
      if (next === 'resting') {
        // Rest: the shadow retracts first (160ms), then the fill cuts to hollow.
        show(id, 'retracting');
        later(() => {
          if (shown[id] === 'retracting') show(id, 'resting');
        }, tokens.motion.durationMs.stamp);
      } else {
        // Wake from resting pops 0.9 → 1 as the shadow grows back.
        show(id, next, next === 'active' && (cur === 'resting' || cur === 'retracting'));
      }
    }
    clearTimeout(restTimer);
    const ms = machine.nextChangeIn();
    restTimer = ms === null ? undefined : setTimeout(sync, ms);
  }
  const unsubscribe = machine.subscribe(sync);

  // Zones are measured once, then cached until the layer resizes (viewport resize, orientation
  // change, or this layer or an ancestor being hidden or shown).
  let cache: TouchZone[] | null = null;
  const invalidate = (): void => {
    cache = null;
  };
  const resize = new ResizeObserver(invalidate);
  resize.observe(element);
  function measure(): TouchZone[] {
    const zones: TouchZone[] = [];
    for (const id of TOUCH_CONTROL_IDS) {
      const r = slots[id].getBoundingClientRect();
      // Zero size: hidden, so nothing can be pressed.
      if (r.width === 0) return [];
      zones.push(
        isPad(id)
          ? { id, shape: 'rect', left: r.left, top: r.top, width: r.width, height: r.height }
          : { id, shape: 'circle', cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 },
      );
    }
    return zones;
  }

  // Window capture runs before the input layer's hit test, so the first touch can already press.
  const reveal = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || !element.hidden) return;
    element.hidden = false;
    invalidate();
  };
  window.addEventListener('pointerdown', reveal, { capture: true });

  return {
    element,
    machine,
    zones: () => (cache ??= measure()),
    wake() {
      invalidate();
      machine.wake();
    },
    destroy() {
      unsubscribe();
      resize.disconnect();
      clearTimeout(restTimer);
      timers.forEach(clearTimeout);
      window.removeEventListener('pointerdown', reveal, { capture: true });
      element.remove();
    },
  };
}
