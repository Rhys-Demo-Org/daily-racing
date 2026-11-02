// @vitest-environment happy-dom
// Screen stages (src/ui/stages/*.stage.ts): every registered stage shows something a player can
// see, every stage file is registered, and the game's entry never reaches the stages, so they stay
// out of the production bundle.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/ui/stages/registry.ts';
import './helpers.ts';

const STAGES_DIR = 'src/ui/stages';

/** Relative imports of a source file, resolved to repo paths (side-effect and type imports included). */
function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)].map((m) => normalize(join(dirname(file), m[1] ?? '')));
}

/** The text a player would see: text nodes with no `hidden` or `aria-hidden="true"` ancestor. */
function visibleText(root: HTMLElement): string {
  const shown = (el: Element | null): boolean => {
    for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
      if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (shown(n.parentElement)) parts.push(n.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

describe('screen stages', () => {
  it('registers at least one stage, each under a unique name', () => {
    const names = STAGES.map((s) => s.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(STAGES.map((s) => [s.name, s] as const))('%s renders visible content', (_, stage) => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    expect(() => stage.render(root)).not.toThrow();
    expect(visibleText(root)).not.toBe('');
  });

  it('registers every stage file, and keeps stage files in src/ui/stages', () => {
    const files = readdirSync(STAGES_DIR).filter((f) => f.endsWith('.stage.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const prefix = `${f.replace(/\.stage\.ts$/, '')}--`;
      expect(STAGES.some((s) => s.name.startsWith(prefix)), f).toBe(true);
    }
    const elsewhere = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.stage.ts') && !f.startsWith('ui/stages/'));
    expect(elsewhere).toEqual([]);
  });

  it('is never reached from the game entry (src/main.ts)', () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file) || !file.endsWith('.ts')) return;
      seen.add(file);
      imports(file).forEach(walk);
    };
    walk('src/main.ts');
    expect(seen.size).toBeGreaterThan(20);
    expect([...seen].filter((f) => f.startsWith(STAGES_DIR))).toEqual([]);
  });
});
