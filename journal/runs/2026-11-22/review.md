## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
2 findings, 0 verified, 2 dropped; 0 fixes kept after the gates.

### R5-1 · minor · dropped

`src/game.ts`:205: No test or gate runs the new cache-hit branch of `r.view ??= raceView(r.world)`, which is an animation frame where `frame()` ran zero ticks and `draw()` reuses the cached view. That branch is the whole point of C028. Every pinned path reaches `draw()` with `r.view === null`: `startRace` (line 305) and `play()`/`step()` (line 345, always after `tick()`). The hand-driven rAF tests in tests/game/*.test.ts step `now` by 1000/60, so a zero-tick frame only happens through float drift, and no assertion depends on one.

Verifier (none): This is a coverage gap, not a defect. The cache-hit branch behaves correctly on this branch, so no test can fail here because of a problem. The finding is about a hypothetical future regression, which is out of scope for verification.

### R5-2 · minor · dropped

`src/ui/title.css`:120: C049 merged the two `.ui-track-card:focus-visible` rules, moving transform and box-shadow above the `[aria-checked='true']:focus-visible` rule. No gate or test renders a focused track card, so the merged rule's computed styles are never checked. P1 renders static stages with no input, so no card has :focus-visible. tests/ui/track-select.test.ts:95 calls first.focus() in jsdom, which does not evaluate :focus-visible or the cascade.

Verifier (none): The merge is equivalent in the cascade and the focused card looks the same as on main. A missing test for unchanged behaviour is not a defect a failing test could show.
