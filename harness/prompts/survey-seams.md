## Your area: the seams (`src/game.ts`, `src/main.ts`, `src/ui/stages/**`, the `index.ts` files, `CLAUDE.md`)
Where the layers meet and what the harness drives: the game loop, the sim's and render's public
exports, the screen stages, and `window.__racer` (`src/driver/`, owner-only: report problems with it
as `test-pins-internals` only if a fix needs the owner). Look for exports nothing uses, layering
leaks (UI reaching into the sim, render computing geometry the sim owns), and **`CLAUDE.md`
statements that no longer match the code** (category `docs`, file `CLAUDE.md`, quoting both).
Note: the behaviour gates build scenes through `src/render/index.ts` (`createRaceScene`,
`buildCar`, `createMaterials`, `playerLivery`), `src/sim/index.ts` (`validateTrack`,
`trackLayout`) and the stage registry, so those names must stay.
