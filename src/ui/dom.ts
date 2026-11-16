// Small DOM helpers. UI code never sets inline colours: styling is by class, from token variables.
import { tokens } from '@tokens';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an HTML element with an optional class list, children and attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: (Node | string)[] = [],
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** Creates an SVG element. Attributes are geometry only (never fill/stroke colours). */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: Node[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

/** A UI button (never a form submit) that calls onClick. */
export function button(className: string, children: (Node | string)[], onClick: () => void): HTMLButtonElement {
  const b = h('button', `ui-button ${className}`, children, { type: 'button' });
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Sets or clears a class that starts a CSS animation. Setting it again drops it and forces a style
 * flush first, so the animation plays from the start.
 */
export function restartClass(el: HTMLElement, className: string, on: boolean): void {
  el.classList.remove(className);
  if (!on) return;
  void el.offsetWidth;
  el.classList.add(className);
}

/** The triple stripe: red, mustard, cream at 4:2:1 (board header / screen-change pattern). */
export function stripes(className = ''): HTMLElement {
  const stripe = (colour: string): HTMLElement => h('span', `ui-stripe ui-stripe--${colour}`);
  return h('div', `ui-stripes ${className}`.trim(), [stripe('red'), stripe('mustard'), stripe('cream')]);
}

let hatchIds = 0;

/** Full-screen hatch of 3px ink lines every 9px at 45° (UI_RULES §7), as an SVG pattern. */
export function hatch(): SVGSVGElement {
  const id = `ui-hatch-${++hatchIds}`;
  const { lineWidth, pitch, angle } = tokens.hatch;
  return s('svg', { class: 'ui-hatch', 'aria-hidden': 'true' }, [
    s('defs', {}, [
      s('pattern', { id, width: pitch, height: pitch, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${angle})` }, [
        s('rect', { class: 'ui-hatch__line', width: lineWidth, height: pitch }),
      ]),
    ]),
    s('rect', { width: '100%', height: '100%', fill: `url(#${id})` }),
  ]);
}

export interface Overlay {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
}

/** A full-screen menu layer, hidden until show(), which focuses its main button. */
export function overlay(root: HTMLElement, className: string, children: Node[], focus: HTMLElement): Overlay {
  const element = h('div', `ui-layer ui-screen ${className}`, children, { hidden: '' });
  root.append(element);
  return {
    element,
    show() {
      element.hidden = false;
      focus.focus({ preventScroll: true });
    },
    hide() {
      element.hidden = true;
    },
  };
}
