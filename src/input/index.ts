// Combined player input: keyboard + on-screen touch controls → one CarInput per sim step.
// Depends on the sim only for the CarInput type.
import type { CarInput } from '../sim/types.ts';
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
}

export interface Input {
  /** Current input; digital steer is −1, 0 or +1 (left + right together cancel). */
  read(): CarInput;
  /** Releases everything held. */
  reset(): void;
  destroy(): void;
}

export function createInput(opts: InputOptions = {}): Input {
  const keyTarget = opts.keyTarget ?? window;
  const pointerTarget = opts.pointerTarget ?? window;
  const keyboard = createKeyboard(keyTarget);
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

  return {
    read() {
      const k = keyboard.state();
      const t = touch.state();
      const left = k.left || t.left;
      const right = k.right || t.right;
      return { steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: k.gas || t.gas, brake: k.brake || t.brake };
    },
    reset,
    destroy() {
      if (hasWindow) window.removeEventListener('blur', reset);
      keyboard.destroy();
      touch.destroy();
    },
  };
}
