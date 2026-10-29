import * as THREE from 'three';
import { PALETTE_HEX, paletteIndex } from '@tokens';
import { buildScene } from './scene.ts';

declare global {
  interface Window {
    __spike: { ready: boolean; renderFrames: (n: number) => number };
  }
}

const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(w, h);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(PALETTE_HEX[paletteIndex('grass')] as string, 1);
document.body.append(renderer.domElement);
const copies = Number(new URLSearchParams(location.search).get('copies') ?? 1);
const { scene, camera } = buildScene(w, h, copies);
renderer.render(scene, camera);

const gl = renderer.getContext();
window.__spike = {
  ready: true,
  // Renders n frames, each forced to completion with gl.finish(), and returns the mean ms per frame.
  // Timed as one batch because performance.now() is coarsened to 0.1 ms in this context.
  renderFrames(n: number): number {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      camera.position.x = Math.sin(i / 20) * 4;
      renderer.render(scene, camera);
      gl.finish();
    }
    const mean = (performance.now() - t0) / n;
    camera.position.x = 0;
    renderer.render(scene, camera);
    return mean;
  },
};
