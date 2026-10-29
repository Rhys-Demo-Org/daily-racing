// Small 2D (XZ-plane) math helpers. Plain numbers in, plain numbers out.
// Conventions (see types.ts): +x east, +z south; heading 0 = north (−z), clockwise positive.

/** Clamps v into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wraps an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}

/** Heading of a direction vector: 0 = north (−z), π/2 = east (+x). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}
