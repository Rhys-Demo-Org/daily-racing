// Solid icons on the 24 grid (board 02). They fill with currentColor, so the colour comes from CSS.
// Arrows are icons because glyph arrows are not in the font subset.
import { s } from './dom.ts';

export type IconName = 'arrow-left' | 'arrow-right' | 'play' | 'restart';

/** Builds an icon; size it with a class (it has no intrinsic size). */
export function icon(name: IconName, className = ''): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: `ui-icon ${className}`.trim() });
  switch (name) {
    case 'arrow-left':
      svg.append(s('polygon', { points: '17,3 5,12 17,21' }));
      break;
    case 'arrow-right':
      svg.append(s('polygon', { points: '7,3 19,12 7,21' }));
      break;
    case 'play':
      svg.append(s('polygon', { points: '6,3 21,12 6,21' }));
      break;
    case 'restart':
      svg.append(s('path', { d: 'M19 13a7 7 0 1 1-2.6-5.4', class: 'ui-icon__stroke' }), s('polygon', { points: '13,2 21,3 20,11' }));
      break;
  }
  return svg;
}
