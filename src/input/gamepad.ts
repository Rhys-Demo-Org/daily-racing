// Gamepad input through the Gamepad API, standard mapping only (other mappings put buttons
// elsewhere). Polled, not evented: every read asks navigator.getGamepads() for the current state.
// Left stick X steers analogue past a dead-zone, the d-pad steers fully, RT is gas, LT brake/reverse
// and A confirms on menus.

/** Standard-mapping button indices. */
export const PAD_BUTTON = { a: 0, brake: 6, gas: 7, left: 14, right: 15 } as const;

/** |stick X| at or below this reads as centred, so a resting stick never drifts. */
export const STICK_DEAD_ZONE = 0.15;

export interface PadState {
  /** −1…+1; 0 when no pad is connected or the stick rests in the dead-zone. */
  steer: number;
  gas: boolean;
  brake: boolean;
  /** A (button 0) is held. */
  confirm: boolean;
}

const IDLE: PadState = { steer: 0, gas: false, brake: false, confirm: false };

export const clampSteer = (v: number): number => Math.max(-1, Math.min(1, v));

/** Stick X → steer: 0 inside the dead-zone, then rescaled so the edge of the dead-zone is 0 and full tilt is ±1. */
export function stickSteer(x: number): number {
  const m = Math.abs(x);
  if (!(m > STICK_DEAD_ZONE)) return 0;
  return Math.sign(x) * Math.min(1, (m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
}

function connectedPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  let list: readonly (Gamepad | null)[];
  try {
    list = navigator.getGamepads();
  } catch {
    // Blocked by the gamepad permissions policy (SecurityError): same as no pads.
    return [];
  }
  const pads: Gamepad[] = [];
  for (const p of list) if (p && p.connected && p.mapping === 'standard') pads.push(p);
  return pads;
}

const held = (p: Gamepad, i: number): boolean => p.buttons[i]?.pressed === true;

/** Every connected standard pad merged into one state (any pad can steer, accelerate or confirm). */
export function readGamepads(): PadState {
  const pads = connectedPads();
  if (pads.length === 0) return IDLE;
  let steer = 0;
  let gas = false;
  let brake = false;
  let confirm = false;
  for (const p of pads) {
    const dpad = (held(p, PAD_BUTTON.right) ? 1 : 0) - (held(p, PAD_BUTTON.left) ? 1 : 0);
    steer += dpad + stickSteer(p.axes[0] ?? 0);
    gas ||= held(p, PAD_BUTTON.gas);
    brake ||= held(p, PAD_BUTTON.brake);
    confirm ||= held(p, PAD_BUTTON.a);
  }
  return { steer: clampSteer(steer), gas, brake, confirm };
}

export interface ConfirmEdge {
  /** True only on the poll where A goes down; holding it never repeats. Poll it every frame. */
  poll(): boolean;
}

export function createConfirmEdge(): ConfirmEdge {
  let wasDown = false;
  return {
    poll() {
      const down = readGamepads().confirm;
      const fresh = down && !wasDown;
      wasDown = down;
      return fresh;
    },
  };
}
