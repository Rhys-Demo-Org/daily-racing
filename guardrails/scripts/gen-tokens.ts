// Generates every derived token file from guardrails/design/tokens.json, the single source of truth.
//
//   node guardrails/scripts/gen-tokens.ts           write the generated files
//   node guardrails/scripts/gen-tokens.ts --check   exit 1 if any generated file is stale
//
// Outputs:
//   guardrails/palette.json           palette + shade ladder, read by gates (no branch code needed)
//   guardrails/generated/tokens.ts    typed tokens for src/ (import from '@tokens')
//   guardrails/generated/tokens.css   CSS custom properties for src/ui (import '@tokens/css')
//
// These generated files are the only places colour literals may appear outside guardrails/design/.
// Runs under plain Node 24 (native type stripping), so it uses erasable TypeScript only.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokensPath = join(root, 'guardrails', 'design', 'tokens.json');

type Tokens = {
  color: Record<string, string>;
  shadeLadder: Record<string, string>;
  typeScale: Record<string, { mobile: number; desktop: number; font: string; weight: number; italic?: boolean; tracking?: string; case?: string }>;
  font: { display: { family: string; fallback: string }; text: { family: string; fallback: string }; numeric: string };
  space: Record<string, number>;
  radius: Record<string, number | string>;
  outline: Record<string, number>;
  shadow: Record<string, string | number>;
  focusRing: { width: number; offset: number; color: string };
  safeArea: { left: number; right: number; top: number; bottom: number };
  touch: Record<string, number | number[]>;
  motion: { durationMs: Record<string, number>; easing: Record<string, string> };
  hatch: { color: string; lineWidth: number; pitch: number; angle: number };
  desktop: { scale: number; margin: number; outline: number };
  [key: string]: unknown;
};

const HEX = /^#[0-9A-F]{6}$/;

/** Validates tokens.json and returns its palette names in palette-index order. */
function validate(t: Tokens): string[] {
  const names = Object.keys(t.color);
  if (names.length !== 10) throw new Error(`expected 10 palette colours, got ${names.length}`);
  for (const [name, hex] of Object.entries(t.color)) {
    if (!HEX.test(hex)) throw new Error(`colour ${name} is not an upper-case #RRGGBB hex: ${hex}`);
  }
  for (const name of names) {
    const down = t.shadeLadder[name];
    if (down === undefined) throw new Error(`shade ladder has no rung below ${name}`);
    if (!names.includes(down)) throw new Error(`shade ladder maps ${name} to unknown colour ${down}`);
  }
  if (!names.includes(t.focusRing.color)) throw new Error(`focus ring colour ${t.focusRing.color} not in palette`);
  if (!names.includes(t.hatch.color)) throw new Error(`hatch colour ${t.hatch.color} not in palette`);
  return names;
}

function palette(t: Tokens, names: string[]): string {
  const data = {
    $comment: 'GENERATED from guardrails/design/tokens.json by guardrails/scripts/gen-tokens.ts. Do not edit.',
    order: names,
    hex: Object.fromEntries(names.map((n) => [n, t.color[n]])),
    ladder: Object.fromEntries(names.map((n) => [n, t.shadeLadder[n]])),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

function tokensTs(t: Tokens, names: string[]): string {
  const ladderIndex = names.map((n) => names.indexOf(t.shadeLadder[n] as string));
  return [
    '// GENERATED from guardrails/design/tokens.json by guardrails/scripts/gen-tokens.ts. Do not edit.',
    '',
    `export const tokens = ${JSON.stringify(t, null, 2)} as const;`,
    '',
    '/** Palette colour names. A mesh colour is an index into this array (0..9). */',
    `export const PALETTE = ${JSON.stringify(names)} as const;`,
    '',
    'export type PaletteName = (typeof PALETTE)[number];',
    '',
    '/** Hex value per palette index. */',
    `export const PALETTE_HEX = ${JSON.stringify(names.map((n) => t.color[n]))} as const;`,
    '',
    '/** For palette index i, the index one rung down the shade ladder. */',
    `export const LADDER_INDEX = ${JSON.stringify(ladderIndex)} as const;`,
    '',
    '/** Palette index for a colour name. */',
    'export function paletteIndex(name: PaletteName): number {',
    '  return PALETTE.indexOf(name);',
    '}',
    '',
  ].join('\n');
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function px(v: number | string): string {
  return typeof v === 'number' ? `${v}px` : v;
}

function tokensCss(t: Tokens, names: string[]): string {
  const v: string[] = [];
  const add = (name: string, value: string): void => {
    v.push(`  --${name}: ${value};`);
  };

  for (const n of names) add(`color-${n}`, t.color[n] as string);
  for (const n of names) add(`color-${n}-down`, `var(--color-${t.shadeLadder[n]})`);

  add('font-display', `'${t.font.display.family}', ${t.font.display.fallback}`);
  add('font-text', `'${t.font.text.family}', ${t.font.text.fallback}`);
  add('font-numeric', t.font.numeric);
  for (const [name, s] of Object.entries(t.typeScale)) {
    add(`type-${name}-size`, px(s.mobile));
    add(`type-${name}-size-desktop`, px(s.desktop));
    add(`type-${name}-font`, `var(--font-${s.font})`);
    add(`type-${name}-weight`, String(s.weight));
    add(`type-${name}-style`, s.italic ? 'italic' : 'normal');
    if (s.tracking !== undefined) add(`type-${name}-tracking`, s.tracking);
    if (s.case === 'upper') add(`type-${name}-transform`, 'uppercase');
  }

  for (const [name, value] of Object.entries(t.space)) add(`space-${name}`, px(value));
  for (const [name, value] of Object.entries(t.radius)) add(`radius-${name}`, px(value));
  for (const [name, value] of Object.entries(t.outline)) add(`outline-${kebab(name)}`, px(value));
  for (const [name, value] of Object.entries(t.shadow)) add(`shadow-${name}`, px(value));

  add('focus-ring-width', px(t.focusRing.width));
  add('focus-ring-offset', px(t.focusRing.offset));
  add('focus-ring-color', `var(--color-${t.focusRing.color})`);

  add('safe-left', `max(${px(t.safeArea.left)}, env(safe-area-inset-left))`);
  add('safe-right', `max(${px(t.safeArea.right)}, env(safe-area-inset-right))`);
  add('safe-top', px(t.safeArea.top));
  add('safe-bottom', `max(${px(t.safeArea.bottom)}, env(safe-area-inset-bottom))`);

  for (const [name, value] of Object.entries(t.touch)) {
    if (Array.isArray(value)) {
      add(`touch-${kebab(name)}-w`, px(value[0] as number));
      add(`touch-${kebab(name)}-h`, px(value[1] as number));
    } else if (name === 'restAfterMs') {
      add('touch-rest-after', `${value}ms`);
    } else {
      add(`touch-${kebab(name)}`, px(value));
    }
  }

  for (const [name, ms] of Object.entries(t.motion.durationMs)) add(`duration-${name}`, `${ms}ms`);
  for (const [name, curve] of Object.entries(t.motion.easing)) add(`ease-${name}`, curve);

  add('hatch-color', `var(--color-${t.hatch.color})`);
  add('hatch-line', px(t.hatch.lineWidth));
  add('hatch-pitch', px(t.hatch.pitch));
  add('hatch-angle', `${t.hatch.angle}deg`);

  add('desktop-scale', String(t.desktop.scale));
  add('desktop-margin', px(t.desktop.margin));
  add('desktop-outline', px(t.desktop.outline));

  return [
    '/* GENERATED from guardrails/design/tokens.json by guardrails/scripts/gen-tokens.ts. Do not edit. */',
    ':root {',
    ...v,
    '}',
    '',
  ].join('\n');
}

export function generate(): Record<string, string> {
  const t = JSON.parse(readFileSync(tokensPath, 'utf8')) as Tokens;
  const names = validate(t);
  return {
    'guardrails/palette.json': palette(t, names),
    'guardrails/generated/tokens.ts': tokensTs(t, names),
    'guardrails/generated/tokens.css': tokensCss(t, names),
  };
}

function main(): void {
  const check = process.argv.includes('--check');
  const stale: string[] = [];
  for (const [rel, content] of Object.entries(generate())) {
    const path = join(root, rel);
    if (check) {
      let current: string | undefined;
      try {
        current = readFileSync(path, 'utf8');
      } catch {
        current = undefined;
      }
      if (current !== content) stale.push(rel);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  if (stale.length > 0) {
    console.error(`stale generated token files (run pnpm gen:tokens): ${stale.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
