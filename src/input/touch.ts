// Multi-touch input for the on-screen controls (UI_RULES §6). Pointer events anywhere on the target
// are hit-tested against the controls' drawn shapes plus a 12px slop, so a thumb that lands just
// outside a pad still counts. Each pointer holds at most one control; several pointers can hold
// different controls at once (steer + gas), and releasing one never releases another.
import { tokens } from '@tokens';

export type TouchControlId = 'left' | 'right' | 'gas' | 'brake';

export const TOUCH_CONTROL_IDS: readonly TouchControlId[] = ['left', 'right', 'gas', 'brake'];

/** A control's drawn shape in client (viewport) pixels. */
export type TouchZone =
  | { id: TouchControlId; shape: 'rect'; left: number; top: number; width: number; height: number }
  | { id: TouchControlId; shape: 'circle'; cx: number; cy: number; r: number };

/** Receives press/release transitions per control (the touch-controls view implements this). */
export interface TouchListener {
  press(id: TouchControlId): void;
  release(id: TouchControlId): void;
}

export type TouchState = Record<TouchControlId, boolean>;

/** Hit slop beyond each drawn shape, in px. */
export const HIT_SLOP: number = tokens.touch.hitSlop;

/** Distance from a point to a zone's drawn shape (0 inside). */
function distance(z: TouchZone, x: number, y: number): number {
  if (z.shape === 'circle') return Math.max(0, Math.hypot(x - z.cx, y - z.cy) - z.r);
  const dx = Math.max(z.left - x, 0, x - (z.left + z.width));
  const dy = Math.max(z.top - y, 0, y - (z.top + z.height));
  return Math.hypot(dx, dy);
}

/** Returns the control under (x, y), allowing `slop` px beyond its shape; the nearest shape wins. */
export function hitTest(zones: readonly TouchZone[], x: number, y: number, slop = HIT_SLOP): TouchControlId | null {
  let best: TouchControlId | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const d = distance(z, x, y);
    if (d <= slop && d < bestD) {
      best = z.id;
      bestD = d;
    }
  }
  return best;
}

export interface TouchInputOptions {
  /** Current zones; empty while the controls are hidden. Read on every pointer event. */
  zones: () => readonly TouchZone[];
  listener?: TouchListener;
}

export interface TouchInput {
  state(): TouchState;
  /** Releases every held control (e.g. on window blur). */
  reset(): void;
  destroy(): void;
}

export function createTouchInput(target: EventTarget, opts: TouchInputOptions): TouchInput {
  const held = new Map<number, TouchControlId>();
  const counts: Record<TouchControlId, number> = { left: 0, right: 0, gas: 0, brake: 0 };

  const grab = (id: TouchControlId): void => {
    counts[id]++;
    if (counts[id] === 1) opts.listener?.press(id);
  };
  const drop = (id: TouchControlId): void => {
    counts[id] = Math.max(0, counts[id] - 1);
    if (counts[id] === 0) opts.listener?.release(id);
  };

  const onDown = (e: Event): void => {
    const p = e as PointerEvent;
    if (held.has(p.pointerId)) return;
    const id = hitTest(opts.zones(), p.clientX, p.clientY);
    if (!id) return;
    // Stop emulated mouse events, focus and text selection for control presses.
    p.preventDefault();
    held.set(p.pointerId, id);
    grab(id);
  };
  // Sliding onto another control switches to it; drifting off into empty space keeps the hold.
  const onMove = (e: Event): void => {
    const p = e as PointerEvent;
    const cur = held.get(p.pointerId);
    if (!cur) return;
    const id = hitTest(opts.zones(), p.clientX, p.clientY);
    if (id && id !== cur) {
      held.set(p.pointerId, id);
      grab(id);
      drop(cur);
    }
  };
  const onUp = (e: Event): void => {
    const p = e as PointerEvent;
    const cur = held.get(p.pointerId);
    if (!cur) return;
    held.delete(p.pointerId);
    drop(cur);
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);

  const reset = (): void => {
    for (const id of held.values()) drop(id);
    held.clear();
  };

  return {
    state: () => ({ left: counts.left > 0, right: counts.right > 0, gas: counts.gas > 0, brake: counts.brake > 0 }),
    reset,
    destroy() {
      reset();
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    },
  };
}
