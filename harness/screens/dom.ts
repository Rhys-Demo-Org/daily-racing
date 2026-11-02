// The DOM + computed-style snapshot of one rendered screen (gate P1, plans/full-pipeline.md "The 7th
// day"): one line per element, text node and drawn pseudo-element, in document order, with the
// element's attributes, its box (CSS px, 2 decimals) and the computed value of every STYLE_PROPS
// property. Two renders of the same stage from main and from the branch must give the same lines.
//
// snapshotDom runs inside the page (page.evaluate(snapshotDom, STYLE_PROPS)), so it is
// self-contained: no imports, no closure over this module.

/** The computed styles a snapshot records: everything that moves pixels or changes what is hit. */
export const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'box-sizing',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-width', 'outline-style', 'outline-color', 'outline-offset',
  'color', 'background-color', 'background-image', 'background-size', 'background-position', 'opacity', 'visibility',
  'box-shadow', 'text-shadow', 'filter', 'mix-blend-mode', 'clip-path', 'transform', 'transform-origin',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'line-height', 'letter-spacing', 'word-spacing',
  'text-transform', 'text-align', 'text-decoration-line', 'text-decoration-color', 'text-overflow', 'white-space', 'font-variant-numeric',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'row-gap', 'column-gap',
  'overflow-x', 'overflow-y', 'pointer-events', 'touch-action', 'user-select', 'cursor',
  'fill', 'stroke', 'stroke-width', 'content', 'list-style-type', 'animation-name', 'transition-property',
] as const;

/**
 * Snapshot lines of `document.body` (or `rootSelector`) with the computed values of `props`. The
 * root lists every value; below it each element lists only the values that differ from its parent's
 * (and a pseudo-element from its element's), so equal lines mean equal styles everywhere.
 */
export function snapshotDom(props: readonly string[], rootSelector = 'body'): string[] {
  const out: string[] = [];
  const num = (v: number): string => String(Math.round(v * 100) / 100);
  const read = (s: CSSStyleDeclaration): Record<string, string> => Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]));
  const delta = (s: Record<string, string>, base: Record<string, string> | null): string =>
    props.filter((p) => !base || s[p] !== base[p]).map((p) => `${p}:${s[p]}`).join(';');
  const walk = (node: Node, depth: number, parent: Record<string, string> | null): void => {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push(`${pad}"${t}"`);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const attrs = Array.from(el.attributes).map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
    const r = el.getBoundingClientRect();
    const own = read(getComputedStyle(el));
    out.push(`${pad}<${el.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ''}> @${num(r.x)},${num(r.y)} ${num(r.width)}x${num(r.height)} {${delta(own, parent)}}`);
    for (const pseudo of ['::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      const content = s.getPropertyValue('content');
      if (content && content !== 'none' && content !== 'normal') out.push(`${pad}  ${pseudo} {${delta(read(s), own)}}`);
    }
    for (const c of Array.from(el.childNodes)) walk(c, depth + 1, own);
  };
  const root = document.querySelector(rootSelector);
  if (root) walk(root, 0, null);
  return out;
}
