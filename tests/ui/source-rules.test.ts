// Static checks on src/ui and src/input sources for the UI_RULES hard rules: tokens only, no
// opacity/filter/gradient/blend/blur, and transitions/animations only on allowed properties.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIRS = ['src/ui', 'src/input'];
const files = DIRS.flatMap((d) => readdirSync(d, { recursive: true, encoding: 'utf8' }).map((f) => join(d, f))).filter((f) => /\.(ts|css)$/.test(f));
const css = files.filter((f) => f.endsWith('.css'));
/** Source without comments. */
const code = (f: string): string =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('UI source rules', () => {
  it('finds the UI sources', () => {
    expect(css.length).toBeGreaterThanOrEqual(5);
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('has no colour literals', () => {
    for (const f of files) {
      expect(code(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    }
  });

  it('has no opacity, filter, gradient, blend mode or blur', () => {
    for (const f of css) {
      expect(code(f), f).not.toMatch(/opacity|filter|gradient|blend|blur/i);
    }
    // TS may use Array#filter, so look only for the style words there.
    for (const f of files.filter((x) => x.endsWith('.ts'))) {
      expect(code(f), f).not.toMatch(/opacity|gradient|blend-mode|blur\(/i);
    }
  });

  it('writes no raw px or ms values in CSS (tokens and calc() of tokens only; zero is fine)', () => {
    for (const f of css) {
      const src = code(f).replace(/(?<![\d.])0(px|ms|s)\b/g, '0');
      expect(src, f).not.toMatch(/\d(px|ms|s)\b/);
    }
  });

  it('only transitions transform and box-shadow, and only animates allowed properties', () => {
    const keyframes = new Set<string>();
    for (const f of css) {
      const src = code(f);
      for (const m of src.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) {
        const value = m[1] ?? '';
        if (value.trim() === 'none') continue;
        for (const part of value.split(',')) {
          expect(part.trim().split(/\s+/)[0], f).toMatch(/^(transform|box-shadow)$/);
        }
      }
      for (const m of src.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
        keyframes.add(m[1] ?? '');
        for (const p of (m[2] ?? '').matchAll(/([\w-]+)\s*:/g)) {
          expect(p[1], f).toMatch(/^(transform|box-shadow|clip-path|visibility)$/);
        }
      }
    }
    // Every animation runs one of the keyframes checked above.
    expect(keyframes.size).toBeGreaterThanOrEqual(5);
    for (const f of css) {
      for (const m of code(f).matchAll(/animation(?:-name)?:\s*([^;]+);/g)) {
        const value = m[1] ?? '';
        if (value.trim() === 'none') continue;
        for (const part of value.split(',')) {
          expect(part.trim().split(/\s+/).some((w) => keyframes.has(w)), `${f}: ${part.trim()}`).toBe(true);
        }
      }
    }
  });

  it('sets no inline styles from TypeScript', () => {
    for (const f of files.filter((x) => x.endsWith('.ts'))) {
      expect(code(f), f).not.toMatch(/\.style\b|setAttribute\(\s*['"]style/);
    }
  });

  it('keeps the input layer free of sim imports beyond types', () => {
    for (const f of files.filter((x) => x.startsWith('src/input'))) {
      for (const m of code(f).matchAll(/^import\s+(type\s+)?[^;]*from\s+['"]([^'"]+)['"]/gm)) {
        if ((m[2] ?? '').includes('/sim/')) expect(m[1], `${f}: ${m[0]}`).toBe('type ');
      }
    }
  });
});
