// Race HUD (mockup S1–S2): POS + LAP + minimap top-left, TIME + BEST top-right.
// The game loop calls update() every frame. Each shown value is one persistent Text node or SVG
// attribute, written only when its cached value changes; update() never reads the DOM or allocates.
import { tokens } from '@tokens';
import './components.css';
import './hud.css';
import { h, s } from './dom.ts';
import { formatOptionalTime, formatTime } from './format.ts';
import type { HudState, MinimapState } from './types.ts';

export interface Hud {
  /** The HUD layer element (absolute, fills root). */
  readonly element: HTMLElement;
  update(state: HudState): void;
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
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** A Text node rewritten only when its value changes. */
function field<T>(format: (v: T) => string): { node: Text; set(v: T): void } {
  const node = document.createTextNode('');
  let last: T | undefined;
  return {
    node,
    set(v) {
      if (v === last) return;
      last = v;
      node.data = format(v);
    },
  };
}

export function createHud(root: HTMLElement): Hud {
  const pos = field<number>(String);
  const count = field<number>(String);
  const lap = field<number>(String);
  const laps = field<number>(String);
  const time = field(formatTime);
  const best = field(formatOptionalTime);

  const road = s('path', { class: 'ui-hud-map__road' });
  const edge = s('path', { class: 'ui-hud-map__edge' });
  const carsGroup = s('g');
  const map = s('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, role: 'img', 'aria-label': 'Track map' }, [edge, road, carsGroup]);

  const element = h('div', 'ui-layer ui-hud', [
    h('div', 'ui-hud__tl', [
      h('div', 'ui-hud__row', [
        h('div', 'ui-panel ui-panel--navy ui-hud-panel ui-hud-pos', [
          h('span', 'ui-label', ['Pos']),
          h('span', 'ui-hud-pos__value', [h('span', 'ui-hud-pos__n', [pos.node]), h('span', 'ui-hud-pos__of', ['/', count.node])]),
        ]),
        h('div', 'ui-panel ui-panel--cream ui-hud-panel ui-hud-lap', [h('span', 'ui-label', ['Lap']), h('span', 'ui-value', [lap.node, '/', laps.node])]),
      ]),
      h('div', 'ui-panel ui-panel--navy ui-hud-map', [map]),
    ]),
    h('div', 'ui-hud__tr', [
      h('div', 'ui-panel ui-panel--navy ui-hud-panel ui-hud-time', [h('span', 'ui-label', ['Time']), h('span', 'ui-value', [time.node])]),
      h('div', 'ui-panel ui-panel--mustard ui-hud-best', [h('span', 'ui-label', ['Best']), h('span', 'ui-hud-best__value', [best.node])]),
    ]),
  ]);
  root.append(element);

  // A new race passes a new outline array: refit it and rebuild the dots (colours may differ).
  // Otherwise the dots only move.
  let outline: MinimapState['outline'] | null = null;
  let scale = 1;
  let ox = 0;
  let oz = 0;
  /** Car dots with their last written cx/cy. */
  let dots: { el: SVGCircleElement; x: number; y: number }[] = [];

  function rebuild(m: MinimapState): void {
    if (m.outline !== outline) {
      outline = m.outline;
      const xs = outline.map((p) => p[0]);
      const zs = outline.map((p) => p[1]);
      const minX = Math.min(...xs);
      const minZ = Math.min(...zs);
      const w = Math.max(Math.max(...xs) - minX, 1e-6);
      const d = Math.max(Math.max(...zs) - minZ, 1e-6);
      scale = Math.min((MAP_W - 2 * MAP_PAD) / w, (MAP_H - 2 * MAP_PAD) / d);
      // Centre the track; +x is east (right), +z is south (down), so north is up.
      ox = (MAP_W - w * scale) / 2 - minX * scale;
      oz = (MAP_H - d * scale) / 2 - minZ * scale;
      const pts = outline.map(([x, z]) => `${r1(x * scale + ox)} ${r1(z * scale + oz)}`);
      const path = pts.length ? `M${pts.join('L')}Z` : '';
      road.setAttribute('d', path);
      edge.setAttribute('d', path);
    }
    dots = m.cars.map((c) => ({
      el: s('circle', { r: c.player ? PLAYER_R : DOT_R, class: `ui-hud-map__car ui-hud-map__car--${c.colour}` }),
      x: NaN,
      y: NaN,
    }));
    carsGroup.replaceChildren(...dots.map((d) => d.el));
    // Player last so it draws on top.
    const player = dots[m.cars.findIndex((c) => c.player)];
    if (player) carsGroup.append(player.el);
  }

  return {
    element,
    update(st) {
      pos.set(st.position);
      count.set(st.carCount);
      lap.set(st.lap);
      laps.set(st.laps);
      // Before GO the timer reads 0:00.00 (mockup S3).
      time.set(st.timeMs ?? 0);
      best.set(st.bestLapMs);
      const m = st.minimap;
      if (m.outline !== outline || m.cars.length !== dots.length) rebuild(m);
      for (let i = 0; i < dots.length; i++) {
        const c = m.cars[i];
        const d = dots[i];
        if (!c || !d) continue;
        const x = r1(c.x * scale + ox);
        const y = r1(c.z * scale + oz);
        if (x !== d.x) d.el.setAttribute('cx', String((d.x = x)));
        if (y !== d.y) d.el.setAttribute('cy', String((d.y = y)));
      }
    },
  };
}
