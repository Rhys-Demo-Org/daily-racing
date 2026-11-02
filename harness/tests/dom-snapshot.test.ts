// @vitest-environment happy-dom
// Gate P1's in-page snapshot (harness/screens/dom.ts): one line per element and text node with its
// box and computed styles, each element listing only what differs from its parent.
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshotDom, STYLE_PROPS } from '../screens/dom.ts';

beforeEach(() => {
  document.body.innerHTML = '<div class="panel" style="color: red"><span data-x="1">Lap 1 / 3</span><b>  GO! </b></div>';
});

describe('snapshotDom', () => {
  it('lists elements and trimmed text in document order with sorted attributes', () => {
    const lines = snapshotDom(STYLE_PROPS);
    expect(lines.map((l) => l.replace(/ @.*$/, ''))).toEqual(['<body>', '  <div class="panel" style="color: red">', '    <span data-x="1">', '      "Lap 1 / 3"', '    <b>', '      "GO!"']);
    expect(lines[0]).toContain('display:');
  });

  it('the root lists every property, children only what differs from their parent', () => {
    const [body, div, span] = snapshotDom(STYLE_PROPS);
    expect(body!.match(/;/g)!.length).toBe(STYLE_PROPS.length - 1);
    expect(div).toMatch(/\{.*color:/);
    expect(span).not.toMatch(/[{;]color:/); // inherited from the div: unchanged, so not repeated
  });

  it('a style change shows up in the snapshot; the same DOM gives the same lines', () => {
    const before = snapshotDom(STYLE_PROPS);
    expect(snapshotDom(STYLE_PROPS)).toEqual(before);
    (document.querySelector('span') as HTMLElement).style.color = 'blue';
    const after = snapshotDom(STYLE_PROPS);
    expect(after[2]).not.toBe(before[2]);
    expect(after[2]).toMatch(/color:/);
    expect(after.filter((l, i) => l !== before[i])).toHaveLength(1);
  });
});
