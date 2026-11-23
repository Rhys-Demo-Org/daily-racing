## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
4 findings, 1 verified, 3 dropped; 1 fixes kept after the gates.

### R3-1 · minor · verified

`tests/sim/rival-pickup-block.test.ts`:12: The new `steerTo` helper rebuilds what `driveToward` in tests/sim/helpers.ts already does: a heading toward a point, a wrapped angle error, a gain of 2.5 and a clamp to ±1. It also hand-rolls the angle wrap and clamp, when `wrapAngle`, `headingOf` and `clamp` from src/sim/vec.ts already cover them.

Verifier (trace): The new test-only steerTo duplicates the existing driveToward helper in tests/sim/helpers.ts (same heading formula, wrap, gain 2.5 and clamp) and hand-rolls helpers from vec.ts. Replacing it gives the same steer values.

Fix: not-fixed. The finding is real. `steerTo` in tests/sim/rival-pickup-block.test.ts:12-18 duplicates `driveToward` from tests/sim/helpers.ts. It uses the same heading formula, wrap, gain of 2.5 and clamp, and only the wrap differs, at exactly ±π. But the only way to remove the duplicate is to edit tests/sim/rival-pickup-block.test.ts, and that test file already exists. My rules allow only src/** (not src/driver/**) and new files under tests/**, and forbid editing any existing test. Nothing under src/ causes the duplicate, so I couldn't fix it within the allowed files. I changed nothing. The cleanup is safe: delete `steerTo` and the now-unused `CarView`/`PickupInstance` type imports, import `driveToward` from './helpers.ts', and use `driveToward(world, box.x, box.z).steer`. Whoever is allowed to edit tests should apply it.

### R5-1 · major · dropped

`tests/sim/rival-boost.test.ts`:357: AC3's test only compares car 0's pickup bookkeeping (armed, boostTicks), not its motion. So it does not check the summary's core rule that firing boosts only that car. If the boost reached every car's engine, the test would still pass.

Verifier (none): The code is correct (boost is per car), so a test of it would pass on this branch and can't fail. AC3's test matches the spec's own wording. This is a coverage or mutation-testing suggestion, not a defect.

### R5-2 · major · dropped

`src/sim/bot.ts`:68: No test checks where a bot fires. Its ramp and corner clearance (fireOk), and its dirt and grounded conditions, can be removed without any new test failing. On Dust Bowl the boxes at 0.04 sit about 0.05 of a lap before the ramp at 0.09, so this is exactly the case the rule exists for.

Verifier (none): Bots fire only in valid spots (grounded, on dirt, clear of ramps), so a fire-spot test passes on this branch. The finding is a missing-coverage or mutation suggestion, not a reproducible defect.

### R5-3 · minor · dropped

`src/sim/pickups.ts`:210: The tie rule (when cars reach a box on the same tick, the lower car index takes it) is in the spec summary but no test covers it. Reversing the order in which cars collect would not fail any test.

Verifier (none): The tie rule is implemented correctly, so the suggested test passes on this branch. The finding is a coverage gap, not a defect.

### Judge fix round

Fix: fixed in `2787116a6407`. The leftover duplicate was the private `steerTo` helper in tests/sim/rival-pickup-block.test.ts. It re-implemented the existing `driveToward` in tests/sim/helpers.ts: heading toward a point (atan2(dx, -dz) = headingOf), wrap the error into ±π, multiply by 2.5 and clamp to [-1, 1]. That file is new in this PR, not an existing test on main, so the earlier reason for not fixing it was wrong. I deleted `steerTo` and car 0's approach now uses `driveToward(world, box.x, box.z).steer`, imported from ./helpers.ts. The diff only touches that new test file. Behaviour is unchanged: the AC4 test still passes, `pnpm typecheck` is clean, and `pnpm test` passes 134/142 files. The 8 files that failed were browser/UI and one game test (best-lap-persistence, countdown-clear-browser, desktop-hud-scale, desktop-start-screen, hud-motion-reduced, keycap-legend-resize, keycap-legend-slide, track-card-press). None touch this code, and all 8 pass when rerun on their own, so they look like timing flakes under full-suite load. This is a duplication fix, so there is no new red/green test. Kept: the gates pass with it.
