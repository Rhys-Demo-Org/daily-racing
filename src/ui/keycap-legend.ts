// Keycap legend (UI_RULES §5, desktop mockup): bottom-left navy panel with the keyboard controls,
// shown on desktop during the player's first lap only. There is no power-up binding yet, so no
// SPACE key. Arrows are SVG icons on the keycaps (glyph arrows are not in the font subset).
import './components.css';
import './keycap-legend.css';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { watchDesktop } from './layout.ts';

export interface KeycapLegend {
  readonly element: HTMLElement;
  /** Whether the player is on the first lap; the legend shows only then, and only on desktop. */
  setFirstLap(firstLap: boolean): void;
}

const key = (glyph: Node | string, primary = false): HTMLElement => h('span', `ui-panel ui-panel--cream ui-keycap${primary ? ' ui-keycap--primary' : ''}`, [glyph]);

const item = (keys: HTMLElement[], label: string): HTMLElement => h('div', 'ui-keys__item', [...keys, h('span', 'ui-label ui-keys__label', [label])]);

export function createKeycapLegend(root: HTMLElement): KeycapLegend {
  const panel = h(
    'div',
    'ui-panel ui-panel--navy ui-keys__panel',
    [
      item([key(icon('key-left')), key(icon('key-right'))], 'STEER'),
      item([key(icon('key-up'), true)], 'GAS'),
      item([key(icon('key-down'))], 'BRAKE'),
      item([key('ESC')], 'PAUSE'),
    ],
    { role: 'group', 'aria-label': 'Keyboard controls' },
  );
  const element = h('div', 'ui-layer ui-keys', [panel], { hidden: '' });
  root.append(element);

  let desktop = false;
  let firstLap = false;
  const update = (): void => {
    element.hidden = !(desktop && firstLap);
  };
  watchDesktop((d) => {
    desktop = d;
    update();
  });

  return {
    element,
    setFirstLap(on) {
      if (on === firstLap) return;
      firstLap = on;
      update();
    },
  };
}
