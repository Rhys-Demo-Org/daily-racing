## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
2 findings, 0 verified, 2 dropped; 1 fixes kept after the gates.

### R3-1 · minor · dropped

`src/render/materials/index.ts`:23: C024 removed six names from the render barrel, and that left them with no importer outside their own file. They still carry `export`: LIGHT_DIRECTION and TOON_STEPS (materials/index.ts:23,26), frameWidthFor (camera.ts:38) and RenderRole (outline.ts:21). This is the exact case C007 cleans up tonight for the other symbols, so the narrowing is half done.

Verifier (none): This is out of scope. The locked spec limits tonight to the listed items, and C007's list does not include LIGHT_DIRECTION, TOON_STEPS, frameWidthFor or RenderRole. Removing those `export`s would be new cleanup work, not a fix to this diff. The reviewer itself suggests leaving it for a later maintenance night.

### R5-1 · minor · dropped

`src/sim/car.ts`:190: The rewritten 'resting on a prop top or car roof' branch of visualPose has no gate or test that runs it. This is the not-airborne case where the hull height y < car.y, so pose.y = car.y and pose.pitch = 0. Tonight's C042 rewrote it from a ternary returning a fresh object into two separate ternary writes to the module scratch `pose`, so nothing pins the change.

Verifier (none): The finding names no bug, only a coverage gap. The rewritten branch is equivalent to the old code. The suggested test would pass on this branch, so it cannot show a defect, and there is nothing to fix.

### Judge fix round

Fix: fixed in `46f3f34bf8b2`. C042 in src/sim/car.ts: groundUnderBody no longer does `bodyTs.length = 0` / `bodyHs.length = 0` followed by `push`, which let V8 free and reallocate each array's backing store on every call. It now writes by index with a local count (`bodyTs[n++] = -half; = 0; = half;`, then `bodyTs[n++] = lip` / `foot` in the same order as before), fills `bodyHs[i]` for i < n with the same groundAt call, and stores the count in a new module scratch `let bodyN` next to bodyTs/bodyHs. visualPose loops `i < bodyN` / `j < bodyN` instead of using `.length` (in both the airborne branch and the hull search). The arrays keep their largest size, so in steady state no array is allocated. The same floats are computed in the same order, so replays and bot laps don't change. I updated the doc comments to match (only the first bodyN entries are current). New test tests/sim/car-pose-scratch.test.ts runs 6 bots on Dust Bowl (which has ramps) and wraps Array.prototype.push while carView is called for every car each tick. It expects 0 pushes: this failed with 4680 on the old length=0+push code and passes after the fix. A second check confirms that a car's view doesn't depend on which car was viewed before it, so stale scratch entries past bodyN are never read. pnpm typecheck and pnpm test (105 files, 718 tests) pass. I couldn't rerun the judge's allocation probe in this sandbox, so the per-frame byte drop is not yet measured. Tests: `tests/sim/car-pose-scratch.test.ts`. Kept: the gates pass with it.
