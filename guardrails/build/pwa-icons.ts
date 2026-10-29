// Vite plugin that draws the PWA icons from code at build time (HANDOVER §1: no image files ship
// in the repo). Palette shapes only: navy ground, rally-red toy car with a cream stripe and roundel,
// ink outline. Emitted as icons/icon-<size>.png; the maskable icon keeps the car in the safe zone.
import { PNG } from 'pngjs';
import type { Plugin } from 'vite';
import { PALETTE_HEX, paletteIndex, type PaletteName } from '../generated/tokens.ts';

/** Manifest entries; `inset` (0..1) shrinks the artwork so the maskable icon keeps it in the safe zone. */
const ICONS = [
  { src: 'icons/icon-192.png', size: 192, inset: 0, purpose: 'any' },
  { src: 'icons/icon-512.png', size: 512, inset: 0, purpose: 'any' },
  { src: 'icons/icon-maskable-512.png', size: 512, inset: 0.2, purpose: 'maskable' },
];

export const PWA_ICONS = ICONS.map(({ src, size, purpose }) => ({ src, sizes: `${size}x${size}`, type: 'image/png', purpose }));

type Rgb = [number, number, number];

function rgb(name: PaletteName): Rgb {
  const n = Number.parseInt((PALETTE_HEX[paletteIndex(name)] as string).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws the icon at `size` px; `inset` (0..1) shrinks the artwork toward the centre. */
export function drawIcon(size: number, inset: number): Buffer {
  const png = new PNG({ width: size, height: size });
  const scale = (1 - inset) * size;
  const off = (size - scale) / 2;
  // Shapes in unit coordinates (0..1 of the artwork box), painted in order.
  const inRect = (u: number, v: number, x0: number, y0: number, x1: number, y1: number): boolean =>
    u >= x0 && u <= x1 && v >= y0 && v <= y1;
  const inCircle = (u: number, v: number, cx: number, cy: number, r: number): boolean =>
    (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
  const o = 0.035; // ink outline width
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - off) / scale;
      const v = (y + 0.5 - off) / scale;
      let c = rgb('navy');
      if (inRect(u, v, 0.12 - o, 0.3 - o, 0.88 + o, 0.72 + o)) c = rgb('ink');
      if (inRect(u, v, 0.12, 0.3, 0.88, 0.72)) c = rgb('rally-red');
      if (inRect(u, v, 0.12, 0.44, 0.88, 0.58)) c = rgb('cream');
      if (inCircle(u, v, 0.5, 0.51, 0.17 + o)) c = rgb('ink');
      if (inCircle(u, v, 0.5, 0.51, 0.17)) c = rgb('cream');
      if (inRect(u, v, 0.475, 0.41, 0.525, 0.61)) c = rgb('ink');
      if (inRect(u, v, 0.2, 0.72 + o, 0.36, 0.82) || inRect(u, v, 0.64, 0.72 + o, 0.8, 0.82)) c = rgb('ink');
      const i = (y * size + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export function pwaIcons(): Plugin {
  return {
    name: 'daily-racer-pwa-icons',
    apply: 'build',
    generateBundle() {
      for (const { src, size, inset } of ICONS) this.emitFile({ type: 'asset', fileName: src, source: drawIcon(size, inset) });
    },
  };
}
