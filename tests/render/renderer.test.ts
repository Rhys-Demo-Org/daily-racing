import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vector2, type WebGLRenderer } from 'three';
import { createRaceScene, MAX_PIXEL_RATIO, pixelRatio, playerLivery } from '../../src/render/index.ts';
import { layout } from './helpers.ts';

describe('pixel ratio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('caps the device pixel ratio at 1.5 while antialias is on', () => {
    expect(MAX_PIXEL_RATIO).toBe(1.5);
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(pixelRatio()).toBe(1.5);
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    expect(pixelRatio()).toBe(1);
  });

  it('scene resize re-reads the device pixel ratio before resizing the renderer', () => {
    let ratio = 1;
    const calls: string[] = [];
    const renderer = {
      getPixelRatio: () => ratio,
      setPixelRatio: (r: number) => {
        ratio = r;
        calls.push(`ratio ${r}`);
      },
      setSize: (w: number, h: number) => calls.push(`size ${w}x${h}`),
      getSize: (v: Vector2) => v.set(844, 390),
    } as unknown as WebGLRenderer;
    const race = createRaceScene(layout, [playerLivery(1)], renderer);
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    race.resize(1440, 900);
    expect(calls).toEqual(['ratio 1.5', 'size 1440x900']);
  });
});
