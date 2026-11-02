## Your area: performance
The game must run smoothly on a mid-range phone. `/inputs/perf.json` has headless numbers from the
VM (counts, not timings: software WebGL says nothing about a phone's frame time):
- `scene.tracks[]` / `scene.cars[]`: objects, meshes, lines, draw calls and triangles of the scene
  graph, and the heaviest objects;
- `page.races[]`: in the running game, draw calls and triangles per rendered frame, DOM mutations per
  tick and the elements they land on, and sampled JS allocations per frame with the top allocating
  functions (`name (bundle:line)`; find the function in `src/` by name);
- `page.stageElements`: DOM elements per screen stage.
Read the per-frame code (`src/game.ts` frame/draw, `RaceScene.update`, `src/ui/race-ui.ts` sync, the
HUD) and look for per-frame allocations (new arrays, objects, closures, strings), DOM writes that
don't change anything, avoidable draw calls or triangles. Every fix must keep the rendered result
and the DOM identical, and change no simulation number. Cite the numbers. If `perf.json` is
missing, review the code only and say so in your evidence.
