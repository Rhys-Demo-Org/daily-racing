// @vitest-environment happy-dom
// R2-2: arrow keys with Alt/Ctrl/Meta are browser shortcuts; the track radiogroup must ignore them.
import { afterEach, expect, it, vi } from 'vitest';
import { createStartScreen } from '../../src/ui/start-screen.ts';
import { memoryBestLaps } from '../../src/ui/best-laps.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const outline: [number, number][] = [[0, 0], [10, 0], [10, 10]];

it('R2-2: Alt/Ctrl/Meta + arrow keys neither change the track nor are prevented', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const screen = createStartScreen(root, {
    onRace: () => {},
    tracks: [{ id: 'a', name: 'A', outline }, { id: 'b', name: 'B', outline }, { id: 'c', name: 'C', outline }],
    bestLaps: memoryBestLaps({}),
  });
  screen.show();
  const first = root.querySelector<HTMLElement>('[role="radio"]');
  for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', [mod]: true, bubbles: true, cancelable: true });
    first?.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(screen.selected()).toBe('a');
  }
});
