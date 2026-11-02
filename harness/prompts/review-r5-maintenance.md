## Your focus: R5, is every changed line exercised? (maintenance)
Tonight's diff is only safe where a gate or test actually runs the changed lines. For **every
function, method, CSS rule or module-level statement the diff changes**, name what executes it:
- G2/G3: bot laps and physics replays over every track (the sim, `src/sim/**`, through `createBot`
  and the replay driver);
- P1: the static screen stages (`src/ui/stages/*.stage.ts`) at two viewports: only what a stage
  renders, settled, with no input;
- P2: every track's static scene after three posed frames, and every car livery (through
  `src/render/index.ts`);
- a unit test in `tests/` (name the file and the test).
Changed lines no gate or test executes (an input handler, a runtime state, an error path, a branch
the stages never reach) are a finding: "add a pinning test", naming the line, the behaviour to pin
and the public seam to pin it through. Also flag new tests that are trivial or pin internal names.
Record in `checked` every changed function you traced and the gate or test that runs it.
