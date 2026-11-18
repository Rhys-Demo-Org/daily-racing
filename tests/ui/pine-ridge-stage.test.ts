// @vitest-environment happy-dom
// B11 · Screen stages for both lock states: 'start--menu' shows Pine Ridge locked (as a first visit),
// 'start--menu-unlocked' shows it enabled with no padlock (after a Hay Loop finish).
import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/ui/stages/registry.ts';
import './helpers.ts';

function pine(stage: string): HTMLElement {
  const found = STAGES.find((s) => s.name === stage);
  if (!found) throw new Error(`no stage ${stage}`);
  const root = document.createElement('div');
  document.body.append(root);
  found.render(root);
  const radio = [...root.querySelectorAll<HTMLElement>('[role="radio"]')].find((c) => c.textContent?.includes('Pine Ridge'));
  if (!radio) throw new Error('no Pine Ridge card');
  return radio;
}

describe('B11 menu stages', () => {
  it('AC10: start--menu-unlocked shows the Pine Ridge card enabled with no padlock', () => {
    const card = pine('start--menu-unlocked');
    expect(card.getAttribute('aria-disabled')).not.toBe('true');
    expect(card.querySelector('[role="img"][aria-label="Locked"]')).toBeNull();
  });

  it('AC10: start--menu shows it locked', () => {
    const card = pine('start--menu');
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.querySelector('[role="img"][aria-label="Locked"]')).not.toBeNull();
  });
});
