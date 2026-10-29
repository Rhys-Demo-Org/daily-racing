// Small DOM helpers. UI code never sets inline colours: styling is by class, from token variables.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an HTML element with an optional class list and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
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

/** Sets text only when it changed, so per-frame updates don't touch the DOM. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** True when the user asked for reduced motion (a user preference, not environment sniffing). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
