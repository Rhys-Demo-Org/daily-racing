// @vitest-environment happy-dom
// Screen stages (src/ui/stages/*.stage.ts): every registered stage renders, the convention is kept,
// and the game's entry never reaches the stages, so they stay out of the production bundle.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectStages, type StageFile } from '../../src/ui/stages/stage.ts';
import { STAGES } from '../../src/ui/stages/registry.ts';
import './helpers.ts';

const STAGES_DIR = 'src/ui/stages';

/** Relative imports of a source file, resolved to repo paths (side-effect and type imports included). */
function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)].map((m) => normalize(join(dirname(file), m[1] ?? '')));
}

describe('screen stages', () => {
  it('registers the core screens', () => {
    const names = STAGES.map((s) => s.name);
    for (const name of ['start--menu', 'countdown--three', 'countdown--go', 'hud--mid-race', 'pause--paused', 'results--podium', 'results--long-list']) {
      expect(names).toContain(name);
    }
    expect(names).toEqual([...names].sort());
  });

  it.each(STAGES.map((s) => [s.name, s] as const))('%s renders without throwing', (_, stage) => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.append(root);
    expect(() => stage.render(root)).not.toThrow();
    const shown = [...root.querySelectorAll<HTMLElement>('.ui-layer')].filter((el) => !el.hidden);
    expect(shown.length).toBeGreaterThan(0);
    expect(root.textContent?.trim()).not.toBe('');
  });

  it('shows the screen each stage is named for', () => {
    const render = (name: string): HTMLElement => {
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      STAGES.find((s) => s.name === name)?.render(root);
      return root;
    };
    expect(render('pause--paused').querySelector('.ui-pause')?.hasAttribute('hidden')).toBe(false);
    expect(render('results--long-list').querySelectorAll('.ui-results__rows [role="row"]').length).toBeGreaterThanOrEqual(8);
    expect(render('countdown--three').querySelector('.ui-countdown')?.textContent).toContain('3');
    expect(render('start--menu').querySelector('.ui-start')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps every stage file in src/ui/stages, named *.stage.ts', () => {
    const inDir = readdirSync(STAGES_DIR);
    for (const f of inDir) expect(f, f).toMatch(/^([a-z0-9-]+\.stage\.ts|stage\.ts|registry\.ts)$/);
    const elsewhere = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.stage.ts') && !f.startsWith('ui/stages/'));
    expect(elsewhere).toEqual([]);
    expect(STAGES.length).toBeGreaterThanOrEqual(inDir.filter((f) => f.endsWith('.stage.ts')).length);
  });

  it('names stages <file>--<stage> and rejects bad files', () => {
    const noop = (): void => {};
    expect(collectStages({ './b.stage.ts': { one: noop }, './a-b.stage.ts': { 'two-x': noop } }).map((s) => s.name)).toEqual(['a-b--two-x', 'b--one']);
    expect(() => collectStages({ './Bad.stage.ts': { one: noop } })).toThrow(/kebab-case/);
    expect(() => collectStages({ './a.stage.ts': { Bad: noop } })).toThrow(/kebab-case/);
    expect(() => collectStages({ './a.stage.ts': {} })).toThrow(/no stages/);
    expect(() => collectStages({ './a.stage.ts': { one: 1 } as unknown as StageFile })).toThrow(/not a function/);
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
