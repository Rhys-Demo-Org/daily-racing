// Screen change (UI_RULES §7, board 05 "8 · screen change"). The game switches state at once and
// this overlay plays on top: a navy cover hides the new screen, which cuts in behind the trailing
// stripe as it sweeps left→right. 'stripes' is the triple stripe (cream leads, then mustard, then
// red, 40ms apart); 'chequer' is the chequered band used when entering a race. The overlay removes
// itself after the wipe plus two staggers. Reduced motion cuts it.
import './components.css';
import './screen-change.css';
import { tokens } from '@tokens';
import { h, s } from './dom.ts';

export type ScreenChangeKind = 'stripes' | 'chequer';

/** How long the overlay stays: the 250ms wipe plus two 40ms staggers. */
export const SCREEN_CHANGE_MS = tokens.motion.durationMs.wipe + tokens.motion.durationMs.stagger * 2;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** True when the player asked for reduced motion. No matchMedia means motion is allowed. */
function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

let chequerIds = 0;

/** A chequer of two palette colours (cream ground, ink squares) as an SVG pattern, like the hatch. */
function chequer(): SVGSVGElement {
  const id = `ui-chequer-${++chequerIds}`;
  const size = tokens.space.s4;
  return s('svg', { class: 'ui-screen-change__chequer', 'aria-hidden': 'true' }, [
    s('defs', {}, [
      s('pattern', { id, width: size * 2, height: size * 2, patternUnits: 'userSpaceOnUse' }, [
        s('rect', { class: 'ui-screen-change__square--light', width: size * 2, height: size * 2 }),
        s('rect', { class: 'ui-screen-change__square--dark', width: size, height: size }),
        s('rect', { class: 'ui-screen-change__square--dark', x: size, y: size, width: size, height: size }),
      ]),
    ]),
    s('rect', { width: '100%', height: '100%', fill: `url(#${id})` }),
  ]);
}

/**
 * Plays a screen change over `root` and returns its element, or null under reduced motion. A change
 * still on show is replaced. `hold` (screen stages only) stops it mid-sweep and keeps it.
 */
export function playScreenChange(root: HTMLElement, kind: ScreenChangeKind, hold = false): HTMLElement | null {
  root.querySelector(':scope > [data-screen-change]')?.remove();
  if (reducedMotion()) return null;
  const band = (name: string, children: Node[] = []): HTMLElement => h('div', `ui-screen-change__band ui-screen-change__band--${name}`, children);
  // The trailing band carries the cover; the leading bands are drawn over it.
  const bands = kind === 'stripes' ? [band('red'), band('mustard'), band('cream')] : [band('chequer', [chequer()])];
  const element = h('div', `ui-layer ui-screen-change ui-screen-change--${kind}${hold ? ' is-held' : ''}`, bands, { 'data-screen-change': kind, 'aria-hidden': 'true' });
  root.append(element);
  if (!hold) setTimeout(() => element.remove(), SCREEN_CHANGE_MS);
  return element;
}
