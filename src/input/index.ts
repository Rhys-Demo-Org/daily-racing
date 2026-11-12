// Combined player input: keyboard + on-screen touch controls + gamepad → one CarInput per sim step.
// Depends on the sim only for the CarInput type.
import type { CarInput } from '../sim/types.ts';
import { clampSteer, createConfirmEdge, readGamepads } from './gamepad.ts';
import { createKeyboard } from './keyboard.ts';
import { createTouchInput, type TouchListener, type TouchZone } from './touch.ts';

export interface InputOptions {
  /** Receives keydown/keyup. Default: window. */
  keyTarget?: EventTarget;
  /** Receives pointer events for touch controls. Default: window. */
  pointerTarget?: EventTarget;
  /** Touch-control zones (from the touch-controls view); omit for keyboard only. */
  touchZones?: () => readonly TouchZone[];
  /** Notified on touch press/release, e.g. the touch-controls state machine. */
  touchListener?: TouchListener;
  /** The pause key went down (see keyboard.ts). */
  onPause?: () => void;
}

export interface Input {
  /** Current input. Keys and touch steer −1, 0 or +1 (left + right together cancel); a gamepad stick adds
   * analogue steer, and the sum is clamped to −1…+1. */
  read(): CarInput;
  /** True once per fresh press of gamepad A (menu confirm); call it every frame so releases are seen. */
  confirmPressed(): boolean;
  /** Releases everything held. */
  reset(): void;
  destroy(): void;
}

export function createInput(opts: InputOptions = {}): Input {
  const keyTarget = opts.keyTarget ?? window;
  const pointerTarget = opts.pointerTarget ?? window;
  const keyboard = createKeyboard(keyTarget, opts);
  const touch = createTouchInput(pointerTarget, {
    zones: opts.touchZones ?? (() => []),
    ...(opts.touchListener ? { listener: opts.touchListener } : {}),
  });
  const reset = (): void => {
    keyboard.reset();
    touch.reset();
  };
  // Keys and touches released while the window is unfocused never send keyup/pointerup.
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) window.addEventListener('blur', reset);
  const confirm = createConfirmEdge();

  return {
    read() {
      const k = keyboard.state();
      const t = touch.state();
      const p = readGamepads();
      const left = k.left || t.left;
      const right = k.right || t.right;
      const steer = clampSteer((right ? 1 : 0) - (left ? 1 : 0) + p.steer);
      return { steer, throttle: k.gas || t.gas || p.gas, brake: k.brake || t.brake || p.brake };
    },
    confirmPressed: () => confirm.poll(),
    reset,
    destroy() {
      if (hasWindow) window.removeEventListener('blur', reset);
      keyboard.destroy();
      touch.destroy();
    },
  };
}
