// Shared by the countdown-framing tests: the player car's on-screen box under a race camera, and
// the countdown roundel's box. Not a test file itself.
import { tokens } from '@tokens';
import { Box3, Vector3, type Camera, type Object3D } from 'three';
import type { RaceScene } from '../../src/render/index.ts';

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The ink outline (≈ 2px at 844 wide) is drawn outside the mesh geometry; pad by more than that. */
const OUTLINE_PAD_PX = 4;

/** Screen box (CSS px) of `objects` (their world bounding boxes, every corner projected), padded for the outline. */
export function screenBox(objects: readonly Object3D[], camera: Camera, width: number, height: number): ScreenBox {
  camera.updateMatrixWorld(true);
  const box = new Box3();
  for (const o of objects) box.expandByObject(o);
  const out = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i < 8; i++) {
    const p = new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const x = ((p.x + 1) / 2) * width;
    const y = ((1 - p.y) / 2) * height;
    out.left = Math.min(out.left, x - OUTLINE_PAD_PX);
    out.right = Math.max(out.right, x + OUTLINE_PAD_PX);
    out.top = Math.min(out.top, y - OUTLINE_PAD_PX);
    out.bottom = Math.max(out.bottom, y + OUTLINE_PAD_PX);
  }
  return out;
}

/** The player car (body, number, ▼ marker) and its blob shadow, on screen. */
export function playerBox(race: RaceScene, width: number, height: number): ScreenBox {
  const shadow = race.scene.getObjectByName('shadows')?.children[0];
  const car = race.cars[0];
  if (!car || !shadow) throw new Error('no player car');
  race.scene.updateMatrixWorld(true);
  return screenBox([car.root, shadow], race.camera, width, height);
}

export const overlaps = (a: ScreenBox, b: ScreenBox): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Widest the roundels lay out at, CSS px (the same at 844×390 and 1440×900): a number roundel is
 * the countdown type size plus s6 across; GO! is wider (measured in Chromium at 251.5px, checked by
 * countdown-clear-browser.test.ts), rounded up.
 */
export const ROUNDEL_WIDTH_PX = { number: tokens.typeScale.countdown.mobile + tokens.space.s6, go: 256 } as const;

/** A roundel `widthPx` wide, centred, taken as the full screen height (any vertical overlap counts). */
export function roundelBox(widthPx: number, width: number, height: number): ScreenBox {
  return { left: (width - widthPx) / 2, right: (width + widthPx) / 2, top: 0, bottom: height };
}

export const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
] as const;
