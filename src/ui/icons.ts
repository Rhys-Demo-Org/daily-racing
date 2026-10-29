// Solid icons on the 24 grid (board 02). They fill with currentColor, so the colour comes from CSS.
// Arrows are icons because glyph arrows are not in the font subset.
import { s } from './dom.ts';

/** Polygon points per icon; restart also draws its arc. */
const POINTS = {
  'arrow-left': '17,3 5,12 17,21',
  'arrow-right': '7,3 19,12 7,21',
  play: '6,3 21,12 6,21',
  restart: '13,2 21,3 20,11',
} as const;

export type IconName = keyof typeof POINTS;

/** Builds an icon; size it with a class (it has no intrinsic size). */
export function icon(name: IconName, className = ''): SVGSVGElement {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: `ui-icon ${className}`.trim() }, [
    ...(name === 'restart' ? [s('path', { d: 'M19 13a7 7 0 1 1-2.6-5.4', class: 'ui-icon__stroke' })] : []),
    s('polygon', { points: POINTS[name] }),
  ]);
}
