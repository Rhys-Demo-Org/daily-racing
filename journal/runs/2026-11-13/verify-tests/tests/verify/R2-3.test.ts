// @vitest-environment happy-dom
// R2-3: stages must be deterministic, so the stripes stage must not read real localStorage bests.
import { afterEach, expect, it } from 'vitest';
import { TRACKS } from '../../src/content/tracks.ts';
import { STAGES } from '../../src/ui/stages/registry.ts';
import '../ui/helpers.ts';

afterEach(() => localStorage.clear());

function text(): string {
  const stage = STAGES.find((s) => s.name === 'screen-change--stripes');
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  stage?.render(root);
  const out = root.querySelector('.ui-start')?.textContent ?? '';
  document.body.replaceChildren();
  return out;
}

it('R2-3: screen-change--stripes renders the same with and without stored bests', () => {
  localStorage.clear();
  const clean = text();
  const id = TRACKS[0]?.id ?? '';
  localStorage.setItem(`racer.bestLap.${id}`, '40370');
  expect(text()).toBe(clean);
});
