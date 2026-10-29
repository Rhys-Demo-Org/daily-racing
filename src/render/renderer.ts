// WebGL renderer set up for the palette-exact colour pipeline (see materials/index.ts):
// no colour management, linear output (the palette bytes go straight to the framebuffer), no tone
// mapping, no shadow maps. The clear colour is grass so any gap reads as ground.
import { ColorManagement, LinearSRGBColorSpace, NoToneMapping, WebGLRenderer } from 'three';
import { PALETTE_HEX, paletteIndex } from '@tokens';

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(PALETTE_HEX[paletteIndex('grass')] as string, 1);
  return renderer;
}
