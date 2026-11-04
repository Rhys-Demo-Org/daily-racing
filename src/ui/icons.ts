// Solid icons on the 24 grid (board 02). They fill with currentColor, so the colour comes from CSS.
// Arrows are icons because glyph arrows are not in the font subset.
import { s } from './dom.ts';

/** Polygons per icon; restart also draws its arc. */
const POINTS = {
  'arrow-left': ['17,3 5,12 17,21'],
  'arrow-right': ['7,3 19,12 7,21'],
  play: ['6,3 21,12 6,21'],
  restart: ['13,2 21,3 20,11'],
  pause: ['5,3 10,3 10,21 5,21', '14,3 19,3 19,21 14,21'],
  home: ['12,2 23,12 20,12 20,22 14,22 14,15 10,15 10,22 4,22 4,12 1,12'],
  // Keycap arrows (keyboard legend): solid head on a stem.
  'key-left': ['3,12 12,4 12,9 21,9 21,15 12,15 12,20'],
  'key-right': ['21,12 12,4 12,9 3,9 3,15 12,15 12,20'],
  'key-up': ['12,3 20,12 15,12 15,21 9,21 9,12 4,12'],
  'key-down': ['12,21 20,12 15,12 15,3 9,3 9,12 4,12'],
} as const;

export type IconName = keyof typeof POINTS;

/** Builds an icon; size it with a class (it has no intrinsic size). */
export function icon(name: IconName, className = ''): SVGSVGElement {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: `ui-icon ${className}`.trim() }, [
    ...(name === 'restart' ? [s('path', { d: 'M19 13a7 7 0 1 1-2.6-5.4', class: 'ui-icon__stroke' })] : []),
    ...POINTS[name].map((points) => s('polygon', { points })),
  ]);
}
