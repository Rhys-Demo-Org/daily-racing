// @vitest-environment happy-dom
// B07: the stage registry has a stage of the race HUD with the NEW BEST chip out, and one of the
// results screen with a NEW BEST LAP chip, both rendering without error.
import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/ui/stages/registry.ts';
import './helpers.ts';

/** Elements whose own text matches `re`, with no `hidden` or `aria-hidden="true"` ancestor up to `root`. */
function visible(root: HTMLElement, re: RegExp): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
    if (!re.test(el.textContent?.trim() ?? '')) return false;
    for (let e: HTMLElement | null = el; e && e !== root; e = e.parentElement) {
      if (e.hidden || e.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  });
}

function render(stage: (typeof STAGES)[number]): HTMLElement {
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  expect(() => stage.render(root)).not.toThrow();
  return root;
}

describe('B07 stages', () => {
  it('AC8: a stage renders the race HUD with the NEW BEST chip visible', () => {
    const found = STAGES.filter((stage) => {
      const root = render(stage);
      const hud = root.querySelector<HTMLElement>('.ui-hud');
      const results = root.querySelector<HTMLElement>('.ui-results');
      const ok = hud !== null && (results === null || results.hidden) && visible(root, /^new best$/i).length > 0;
      document.body.replaceChildren();
      return ok;
    });
    expect(found.length).toBeGreaterThan(0);
  });

  it('AC8: a stage renders the results screen with a NEW BEST LAP chip', () => {
    const found = STAGES.filter((stage) => {
      const root = render(stage);
      const results = root.querySelector<HTMLElement>('.ui-results');
      const ok = results !== null && !results.hidden && visible(results, /^new best lap$/i).length > 0;
      document.body.replaceChildren();
      return ok;
    });
    expect(found.length).toBeGreaterThan(0);
  });
});
