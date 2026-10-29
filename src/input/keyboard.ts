// Keyboard input: arrows and WASD. ← → steer, ↑ gas, ↓ brake. Uses physical key codes, so WASD is
// the same keys on any layout.

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

export interface Keyboard {
  state(): KeyState;
  /** Releases every key (e.g. on window blur, when keyup never arrives). */
  reset(): void;
  destroy(): void;
}

export function createKeyboard(target: EventTarget): Keyboard {
  // Keys currently down, by code, so two keys for one action (← and A) release independently.
  const down = new Set<string>();

  const onDown = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.ctrlKey || k.metaKey || k.altKey) return;
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
    reset: () => down.clear(),
    destroy() {
      down.clear();
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
    },
  };
}
