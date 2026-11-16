// Track card (S6, board 02 "track card"): a dirt thumbnail with the track's centreline drawn as a
// cream road on an ink edge, over a cream name plate (mustard when selected) with the stored best.
// Cards are radios in the start screen's radiogroup, not buttons, so RACE stays the menu's button.
import { tokens } from '@tokens';
import { h, s } from './dom.ts';
import { formatOptionalTime } from './format.ts';
import type { TrackCardView } from './types.ts';

// Drawing area of the thumbnail, from the space scale; the outline keeps one step clear of its edge.
const THUMB_W = tokens.space.s7 * 3;
const THUMB_H = tokens.space.s7 * 2 - tokens.space.s2;
const THUMB_PAD = tokens.space.s2;

export interface TrackCard {
  readonly id: string;
  readonly element: HTMLElement;
  setSelected(selected: boolean): void;
  /** The stored best lap in ms, or null for none. */
  setBest(ms: number | null): void;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** An SVG path of the closed outline, scaled uniformly and centred in the thumbnail. */
export function outlinePath(outline: readonly [number, number][]): string {
  if (outline.length === 0) return '';
  const xs = outline.map((p) => p[0]);
  const zs = outline.map((p) => p[1]);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const scale = Math.min((THUMB_W - THUMB_PAD * 2) / (maxX - minX || 1), (THUMB_H - THUMB_PAD * 2) / (maxZ - minZ || 1));
  const ox = (THUMB_W - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = (THUMB_H - (maxZ - minZ) * scale) / 2 - minZ * scale;
  return `M${outline.map(([x, z]) => `${r1(x * scale + ox)} ${r1(z * scale + oz)}`).join('L')}Z`;
}

let cardIds = 0;

export function createTrackCard(view: TrackCardView, onPick: () => void): TrackCard {
  const d = outlinePath(view.outline);
  const nameId = `ui-track-card-${++cardIds}`;
  const best = h('span', 'ui-label ui-track-card__best', [], { id: `${nameId}-best` });
  const element = h(
    'div',
    'ui-track-card',
    [
      s('svg', { class: 'ui-track-card__thumb', viewBox: `0 0 ${THUMB_W} ${THUMB_H}`, 'aria-hidden': 'true' }, [
        s('path', { class: 'ui-track-card__edge', d }),
        s('path', { class: 'ui-track-card__road', d }),
      ]),
      h('div', 'ui-track-card__plate', [h('span', 'ui-track-card__name', [view.name], { id: nameId }), best]),
    ],
    { role: 'radio', 'aria-checked': 'false', 'aria-labelledby': nameId, 'aria-describedby': `${nameId}-best`, tabindex: '-1', 'data-track-id': view.id },
  );
  element.addEventListener('click', onPick);

  return {
    id: view.id,
    element,
    setSelected(selected) {
      element.setAttribute('aria-checked', String(selected));
      element.tabIndex = selected ? 0 : -1;
    },
    setBest(ms) {
      best.textContent = `BEST ${formatOptionalTime(ms)}`;
    },
  };
}
