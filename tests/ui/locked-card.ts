// Shared by the B14 locked-card tests: read a card's Web Animations and settled pose in Chromium.
import type { Locator, Page } from '@playwright/test';

export interface ShakeState {
  /** Animations on the element (running or paused). */
  count: number;
  duration: number | null;
  easing: string | null;
  fill: string | null;
  /** Each keyframe's transform as [x, y] offsets in px. */
  frames: [number, number][];
}

/** The element's animations, and the timing and keyframes of the first. */
export function shakeState(card: Locator): Promise<ShakeState> {
  return card.evaluate((el) => {
    const anims = el.getAnimations();
    const effect = anims[0]?.effect;
    const keyframes = effect instanceof KeyframeEffect ? effect.getKeyframes() : [];
    const timing = effect?.getTiming();
    const frames = keyframes.map((k): [number, number] => {
      const m = new DOMMatrixReadOnly(String(k['transform'] ?? 'none') === 'none' ? undefined : String(k['transform']));
      return [m.m41, m.m42];
    });
    return {
      count: anims.length,
      duration: typeof timing?.duration === 'number' ? timing.duration : null,
      easing: timing?.easing ?? null,
      fill: timing?.fill ?? null,
      frames,
    };
  });
}

/** Pauses the element's animation and reads its transform offset [x, y] at each of `times` (ms). */
export function sampleShake(card: Locator, times: readonly number[]): Promise<[number, number][]> {
  return card.evaluate((el, ts) => {
    const anim = el.getAnimations()[0];
    if (!anim) throw new Error('no animation');
    anim.pause();
    return ts.map((t): [number, number] => {
      anim.currentTime = t;
      const s = getComputedStyle(el).transform;
      const m = new DOMMatrixReadOnly(s === 'none' ? undefined : s);
      return [m.m41, m.m42];
    });
  }, times);
}

/** Finishes every animation on the element; returns how many are left and whether it is at identity. */
export function finishShake(card: Locator): Promise<{ left: number; identity: boolean }> {
  return card.evaluate((el) => {
    for (const a of el.getAnimations()) a.finish();
    const s = getComputedStyle(el).transform;
    return { left: el.getAnimations().length, identity: s === 'none' || new DOMMatrixReadOnly(s).isIdentity };
  });
}

/** The card's transform offset and box-shadow once every CSS transition on the page has run. */
export function settledPose(page: Page, card: Locator): Promise<{ dx: number; dy: number; identity: boolean; shadow: string }> {
  return page.evaluate(() => {
    for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();
  }).then(() =>
    card.evaluate((el) => {
      const s = getComputedStyle(el);
      const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform);
      return { dx: m.m41, dy: m.m42, identity: m.isIdentity, shadow: s.boxShadow };
    }),
  );
}

/** The checked radio's accessible name text. */
export function checkedName(page: Page): Promise<string> {
  return page.locator('[role="radio"][aria-checked="true"]').innerText();
}

/** The four numbers of a cubic-bezier() easing. */
export const bezier = (easing: string | null): number[] => (easing?.match(/-?[\d.]+/g) ?? []).map(Number);
