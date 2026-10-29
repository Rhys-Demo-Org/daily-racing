// Race HUD (mockup S1–S2): POS + LAP + minimap top-left, TIME + BEST top-right.
// The game loop calls update() every frame; the DOM is only touched when a shown value changes.
import { tokens } from '@tokens';
import './components.css';
import './hud.css';
import { h, s, setText } from './dom.ts';
import { formatOptionalTime, formatTime } from './format.ts';
import type { HudState, MinimapState } from './types.ts';

export interface Hud {
  /** The HUD layer element (absolute, fills root). */
  readonly element: HTMLElement;
  update(state: HudState): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

// Minimap geometry in SVG user units (1 unit = 1 CSS px). The panel is 104×72 outside its 3px
// outline (board 02), so the drawing area is 98×66.
const MAP_W = tokens.space.s7 * 2 + tokens.space.s2 - tokens.outline.default * 2;
const MAP_H = tokens.space.s7 + tokens.space.s5 - tokens.outline.default * 2;
const MAP_PAD = tokens.space.s2;
/** Car dot radii: AI 4 (mockup 3.5), player 5. */
const DOT_R = tokens.space.s1;
const PLAYER_R = tokens.space.s1 + tokens.outline.small / 2;

/** Rounds to 0.1 user units so tiny movements don't rewrite attributes. */
const r1 = (v: number): string => String(Math.round(v * 10) / 10);

export function createHud(root: HTMLElement): Hud {
  const posN = h('span', 'ui-hud-pos__n');
  const posOf = h('span', 'ui-hud-pos__of');
  const lapValue = h('span', 'ui-hud-lap__value');
  const timeValue = h('span', 'ui-hud-time__value');
  const bestValue = h('span', 'ui-hud-best__value');

  const road = s('path', { class: 'ui-hud-map__road' });
  const edge = s('path', { class: 'ui-hud-map__edge' });
  const carsGroup = s('g');
  const map = s('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, role: 'img', 'aria-label': 'Track map' }, [edge, road, carsGroup]);

  const element = h('div', 'ui-layer ui-hud', [
    h('div', 'ui-hud__tl', [
      h('div', 'ui-hud__row', [
        h('div', 'ui-panel ui-panel--navy ui-hud-panel ui-hud-pos', [
          h('span', 'ui-label', ['Pos']),
          h('span', 'ui-hud-pos__value', [posN, posOf]),
        ]),
        h('div', 'ui-panel ui-panel--cream ui-hud-panel ui-hud-lap', [h('span', 'ui-label', ['Lap']), lapValue]),
      ]),
      h('div', 'ui-panel ui-panel--navy ui-hud-map', [map]),
    ]),
    h('div', 'ui-hud__tr', [
      h('div', 'ui-panel ui-panel--navy ui-hud-panel ui-hud-time', [h('span', 'ui-label', ['Time']), timeValue]),
      h('div', 'ui-hud-best', [h('span', 'ui-label', ['Best']), bestValue]),
    ]),
  ]);
  root.append(element);

  // Minimap cache: the outline is refitted only when its array changes; dots are rebuilt only when
  // the set of cars (colour/player) changes.
  let outlineRef: MinimapState['outline'] | null = null;
  let fit = { scale: 1, ox: 0, oz: 0 };
  let carsKey = '';
  let dots: SVGCircleElement[] = [];

  function fitOutline(outline: MinimapState['outline']): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outline) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const w = Math.max(maxX - minX, 1e-6);
    const d = Math.max(maxZ - minZ, 1e-6);
    const scale = Math.min((MAP_W - 2 * MAP_PAD) / w, (MAP_H - 2 * MAP_PAD) / d);
    // Centre the track; +x is east (right), +z is south (down), so north is up.
    fit = { scale, ox: (MAP_W - w * scale) / 2 - minX * scale, oz: (MAP_H - d * scale) / 2 - minZ * scale };
    const pts = outline.map(([x, z]) => `${r1(x * fit.scale + fit.ox)} ${r1(z * fit.scale + fit.oz)}`);
    const d0 = pts.length ? `M${pts.join('L')}Z` : '';
    road.setAttribute('d', d0);
    edge.setAttribute('d', d0);
  }

  function updateMap(m: MinimapState): void {
    if (m.outline !== outlineRef) {
      outlineRef = m.outline;
      fitOutline(m.outline);
    }
    // Player last so it draws on top.
    const cars = [...m.cars.filter((c) => !c.player), ...m.cars.filter((c) => c.player)];
    const key = cars.map((c) => `${c.colour}${c.player ? '*' : ''}`).join(',');
    if (key !== carsKey) {
      carsKey = key;
      dots = cars.map((c) =>
        s('circle', {
          r: c.player ? PLAYER_R : DOT_R,
          class: `ui-hud-map__car ui-hud-map__car--${c.colour}${c.player ? ' ui-hud-map__car--player' : ''}`,
        }),
      );
      carsGroup.replaceChildren(...dots);
    }
    cars.forEach((c, i) => {
      const dot = dots[i];
      if (!dot) return;
      const cx = r1(c.x * fit.scale + fit.ox);
      const cy = r1(c.z * fit.scale + fit.oz);
      if (dot.getAttribute('cx') !== cx) dot.setAttribute('cx', cx);
      if (dot.getAttribute('cy') !== cy) dot.setAttribute('cy', cy);
    });
  }

  return {
    element,
    update(state) {
      setText(posN, String(state.position));
      setText(posOf, `/${state.carCount}`);
      setText(lapValue, `${state.lap}/${state.laps}`);
      // Before GO the timer reads 0:00.00 (mockup S3).
      setText(timeValue, formatTime(state.timeMs ?? 0));
      setText(bestValue, formatOptionalTime(state.bestLapMs));
      updateMap(state.minimap);
    },
    setVisible(visible) {
      element.hidden = !visible;
    },
    destroy() {
      element.remove();
    },
  };
}
