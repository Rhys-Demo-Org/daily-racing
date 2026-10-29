// Small DOM helpers. UI code never sets inline colours: styling is by class, from token variables.

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
