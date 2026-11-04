// Phone or desktop layout (UI_RULES §5). Desktop = a fine pointer and a viewport at least the
// 844×390 reference frame at the desktop scale (×1.45 → 1224×566), all from tokens. CSS media
// queries can't read token variables, so the mode is a class that UI modules toggle from here.
import { tokens } from '@tokens';

const [frameW, frameH] = tokens.safeArea.frame;

/** Smallest desktop viewport in CSS px. */
export const DESKTOP_MIN = {
  width: Math.ceil(frameW * tokens.desktop.scale),
  height: Math.ceil(frameH * tokens.desktop.scale),
} as const;

/** Touch-first devices (they get the touch controls). */
export const COARSE_POINTER = '(pointer: coarse)';

export const DESKTOP_QUERY = `(pointer: fine) and (min-width: ${DESKTOP_MIN.width}px) and (min-height: ${DESKTOP_MIN.height}px)`;

/** Calls `onChange` now with the current mode, then on every change (resize, pointer change). */
export function watchDesktop(onChange: (desktop: boolean) => void): void {
  const query = matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', (e) => onChange(e.matches));
  onChange(query.matches);
}
