import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../../guardrails/scripts/gen-tokens.ts';
import { LADDER_INDEX, PALETTE, PALETTE_HEX, paletteIndex } from '@tokens';

const tokens = JSON.parse(readFileSync('guardrails/design/tokens.json', 'utf8')) as {
  color: Record<string, string>;
  shadeLadder: Record<string, string>;
};

describe('generated tokens', () => {
  it('are up to date with guardrails/design/tokens.json', () => {
    for (const [path, content] of Object.entries(generate())) {
      expect(readFileSync(path, 'utf8'), path).toBe(content);
    }
  });

  it('expose exactly the 10 palette colours in tokens.json order', () => {
    expect(PALETTE).toEqual(Object.keys(tokens.color));
    expect(PALETTE_HEX).toEqual(Object.values(tokens.color));
    expect(new Set(PALETTE_HEX).size).toBe(10);
  });

  it('map every palette index one rung down the shade ladder', () => {
    PALETTE.forEach((name, i) => {
      expect(PALETTE[LADDER_INDEX[i] as number]).toBe(tokens.shadeLadder[name]);
    });
    expect(LADDER_INDEX[paletteIndex('ink')]).toBe(paletteIndex('ink'));
  });

  it('keep palette.json in step with the TS module', () => {
    const palette = JSON.parse(readFileSync('guardrails/palette.json', 'utf8')) as { order: string[]; hex: Record<string, string> };
    expect(palette.order).toEqual([...PALETTE]);
    expect(Object.values(palette.hex)).toEqual([...PALETTE_HEX]);
  });
});
