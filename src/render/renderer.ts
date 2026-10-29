// WebGL renderer set up for the palette-exact colour pipeline (see materials/index.ts):
// no colour management, linear output (the palette bytes go straight to the framebuffer), no tone
// mapping, no shadow maps. The clear colour is grass, and it IS the ground: there is no grass mesh.
import { ColorManagement, LinearSRGBColorSpace, NoToneMapping, WebGLRenderer } from 'three';
import { PALETTE_HEX, paletteIndex } from '@tokens';

/** Pixel-ratio cap. Antialias is on, so DPR 2 would mean 4× MSAA over the full retina buffer. */
export const MAX_PIXEL_RATIO = 1.5;

/** The device pixel ratio, capped. Read it again on every resize (it changes across monitors and zoom). */
export function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(pixelRatio());
  renderer.setClearColor(PALETTE_HEX[paletteIndex('grass')] as string, 1);
  return renderer;
}
