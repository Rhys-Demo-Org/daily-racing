// Keyboard input: arrows and WASD. ← → steer, ↑ gas, ↓ brake; Space fires the power-up; Esc toggles
// pause. Uses physical key codes, so WASD is the same keys on any layout.

export type KeyAction = 'left' | 'right' | 'gas' | 'brake';

/** Physical key code → action. */
export const KEY_MAP: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
};

export type KeyState = Record<KeyAction, boolean>;

/** Physical key code that fires the power-up. */
export const ACTION_KEY = 'Space';

/** Focused elements whose own Space activation wins over the power-up. */
const INTERACTIVE = 'button, a, input, select, textarea';

/** Physical key code that toggles pause (a command, not a held action). */
export const PAUSE_KEY = 'Escape';

export interface KeyboardOptions {
  /** PAUSE_KEY went down (key repeat ignored). */
  onPause?: () => void;
}

export interface Keyboard {
  state(): KeyState;
  /** ACTION_KEY is down, or went down since the last call (so a tap between reads still counts). */
  actionPressed(): boolean;
  /** Releases every key (e.g. on window blur, when keyup never arrives). */
  reset(): void;
  destroy(): void;
}

export function createKeyboard(target: EventTarget, opts: KeyboardOptions = {}): Keyboard {
  // Keys currently down, by code, so two keys for one action (← and A) release independently.
  const down = new Set<string>();
  let actionTapped = false;

  const onDown = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.ctrlKey || k.metaKey || k.altKey) return;
    if (k.code === PAUSE_KEY) {
      if (!k.repeat) opts.onPause?.();
      return;
    }
    if (k.code === ACTION_KEY) {
      // Space on a focused menu control (RACE, RESUME, NEXT RACE) is that control's: leave its
      // default alone. A Space already held keeps its latch, so it can't click a button that appears.
      if (!down.has(k.code) && (k.target as Element | null)?.closest?.(INTERACTIVE)) return;
      k.preventDefault(); // Space would scroll
      down.add(k.code);
      actionTapped = true;
      return;
    }
    if (!(k.code in KEY_MAP)) return;
    k.preventDefault(); // arrows would scroll
    down.add(k.code);
  };
  const onUp = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (down.delete(k.code)) k.preventDefault();
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);

  return {
    state() {
      const s: KeyState = { left: false, right: false, gas: false, brake: false };
      for (const code of down) {
        const action = KEY_MAP[code];
        if (action) s[action] = true;
      }
      return s;
    },
    actionPressed() {
      const on = actionTapped || down.has(ACTION_KEY);
      actionTapped = false;
      return on;
    },
    reset() {
      down.clear();
      actionTapped = false;
    },
    destroy() {
      down.clear();
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
    },
  };
}
