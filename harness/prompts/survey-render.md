## Your area: render (`src/render/**`)
The Three.js scene and procedural meshes. Look for duplicated mesh-building code, helpers that
reimplement what `geometry.ts`, `outline.ts` or the materials factory already offer, dead exports,
and code that can be simpler with byte-identical geometry, palette indices, materials and
transforms. Per-frame cost belongs to the performance pass; leave it.
