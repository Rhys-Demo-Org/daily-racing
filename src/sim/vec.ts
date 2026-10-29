// Small 2D (XZ-plane) math helpers. Plain numbers in, plain numbers out.
// Conventions (see types.ts): +x east, +z south; heading 0 = north (−z), clockwise positive.

export interface Vec2 {
  x: number;
  z: number;
}

/** Clamps v into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation from a to b by t. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wraps an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}

/** Unit forward vector for a heading (0 = north = −z, π/2 = east = +x). */
export function forward(heading: number): Vec2 {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

/** Unit vector pointing to the right of a heading (clockwise 90°). */
export function right(heading: number): Vec2 {
  return { x: Math.cos(heading), z: Math.sin(heading) };
}

/** Heading of a direction vector (inverse of `forward`). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

export function dot(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

export function length(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export function distance(ax: number, az: number, bx: number, bz: number): number {
  return length(bx - ax, bz - az);
}
