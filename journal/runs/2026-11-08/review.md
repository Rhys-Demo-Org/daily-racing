## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
2 findings, 0 verified, 2 dropped; 0 fixes kept after the gates.

### R1-1 · minor · dropped

`src/sim/track.ts`:224: C003 is only half done. The spec's fix has two parts: drop the redundant `as const` at line 224, and return `propRows` directly at line 240. The diff did the second part only, so the redundant `as const` is still there.

Verifier (none): The `as const` is not redundant. Without it, `side` widens to string in the object literal and typecheck fails at the `propRows` return. The spec's plan audit requires the change to pass typecheck, so the suggested fix would break the build.

### R3-1 · minor · dropped

`src/sim/track.ts`:224: C003 is only half done. The item's suggested fix and plan audit say to drop the redundant `as const` on the prop-row literal as well as the second copy. The diff removed the copy at line 240 but left the `as const`, which no longer does anything because `side` is already narrowed by `fail` (returns never).

Verifier (none): duplicate of R1-1
