// The player's car on the title panel (S6): a top-down tin-toy #1, rally-red with a cream stripe,
// navy cabin and cream roof roundel (UI_RULES §8), on a flat ink shadow, angled nose up-right.
// Geometry only; every colour comes from CSS classes.
import { s } from './dom.ts';

export function titleCar(number = 1): SVGSVGElement {
  return s('svg', { class: 'ui-title-car', viewBox: '0 0 128 96', role: 'img', 'aria-label': `Player car #${number}` }, [
    s('g', { transform: 'rotate(-20 64 48)' }, [
      s('rect', { class: 'ui-title-car__shadow', x: 20, y: 32, width: 96, height: 44, rx: 4 }),
      ...[
        [26, 20],
        [80, 20],
        [26, 66],
        [80, 66],
      ].map(([x, y]) => s('rect', { class: 'ui-title-car__wheel', x: x ?? 0, y: y ?? 0, width: 18, height: 10, rx: 2 })),
      s('rect', { class: 'ui-title-car__body', x: 14, y: 26, width: 96, height: 44, rx: 4 }),
      s('rect', { class: 'ui-title-car__stripe', x: 14, y: 44, width: 96, height: 8 }),
      s('rect', { class: 'ui-title-car__cabin', x: 44, y: 32, width: 36, height: 32, rx: 4 }),
      s('circle', { class: 'ui-title-car__roundel', cx: 62, cy: 48, r: 11 }),
      s('text', { class: 'ui-title-car__number', x: 62, y: 48, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: 'rotate(20 62 48)' }, [
        document.createTextNode(String(number)),
      ]),
    ]),
  ]);
}
