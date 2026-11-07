## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
2 findings, 2 verified, 0 dropped; 2 fixes kept after the gates.

### R3-1 · minor · verified

`tests/content/hay-loop.test.ts`:19: The new test's geometry() writes its own heading formula and angle wrap instead of using `headingOf` and `wrapAngle` from `src/sim/vec.ts`. Other tests already import those two helpers directly (tests/sim/helpers.ts:14, tests/sim/track.test.ts:23).

Verifier (trace): The new test re-implements headingOf and wrapAngle, which already exist in src/sim/vec.ts and do the same thing. Swapping in the imports doesn't change behaviour.

Fix: fixed in `f503df21b2ba`. This was a duplication finding, so it needed no red/green test. In tests/content/hay-loop.test.ts (tonight's new file) I added `import { headingOf, wrapAngle } from '../../src/sim/vec.ts';`. The heading helper now returns `headingOf(bx - ax, bz - az)` in place of the inline `Math.atan2(bx - ax, -(bz - az))`. The turn delta now uses `wrapAngle(d)` in place of `Math.atan2(Math.sin(d), Math.cos(d))`. Both helpers compute the same values over (−π, π], so the test behaves as before and the copied maths is gone. `pnpm typecheck` passes, and `pnpm test` passes all 82 files and 622 tests, including the Hay Loop suite. Kept: the gates pass with it.

### R4-1 · minor · verified

`src/content/tracks/hay-loop.json`:46: The hairpin's inside hay-bale row is offset 7.5 units from a centreline whose radius around the hairpin is not much bigger than that. Spacing on the offset line shrinks to well under the 2-unit bale length, so neighbouring bale boxes pass through each other. The screenshots show bales stacked and crossing, with crease lines cutting across them, where §8/§9 call for separate boxes with clean ink outlines.

Verifier (test): The hairpin's inside bale colliders really do intersect, so the bales overlap visually. The test passes once the row's offset or extent is changed so that no two boxes intersect.

Fix: fixed in `72479e36b07d`. In src/content/tracks/hay-loop.json, the hairpin's single inside hay-bale row (from 0.41 to 0.475, spacing 4, offset 2) is now three rows, all at offset 1:
- 0.41–0.43 at spacing 4 (approach leg)
- 0.437–0.463 at spacing 6 (the tip)
- 0.47–0.49 at spacing 4 (exit leg)

The centreline's radius drops to about 8–10 units around the tip, so a 7.5-unit inside offset folded the offset path and packed bales 4 units apart on the centreline into less than 2 units. With offset 1 the bales sit 6.5 units from the centreline. Wider spacing at the tip keeps neighbouring 2×1.2 bale boxes apart, and the rows on the straighter legs keep the inside lined.

AC6 still holds, with at least 6 inside bales in the hairpin window, each within 5 units of the edge and at least half-width + 1 from the centreline. No sim, render or UI code changed.

New test: tests/content/hay-loop-bales.test.ts. It is the verifier's separating-axis overlap test on the hairpin's inside bales (x > 200). It failed before the fix with 6 intersecting pairs and passes after.

`pnpm typecheck` is clean and `pnpm test` passes all 623 tests in 83 files, including the Hay Loop AC1–AC7 tests and the bot and six-car suites. In the regenerated 1440×900 hay-loop mid-race screenshot, the hairpin bales are separate boxes with clean outlines.

Out of scope and left alone: the S-bend hay-bale row (0.13–0.17, spacing 2.1) has two pairs of bales that just touch at its curve (centres about 2.0 apart). Tests: `tests/content/hay-loop-bales.test.ts`. Kept: the gates pass with it.
