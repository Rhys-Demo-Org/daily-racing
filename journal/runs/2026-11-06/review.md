## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
4 findings, 0 verified, 4 dropped; 0 fixes kept after the gates.

### R2-1 · minor · dropped

`src/ui/race-ui.ts`:122: The best-lap store is read only once, in reset(). Later, `state.bestLapMs` is a stale snapshot of storage. If the stored best changes while a race is running (a second tab, window or installed-PWA instance on the same origin), a lap that beats the stale snapshot overwrites a faster stored best with a slower time. It also shows the NEW BEST chip and the NEW BEST LAP results label for a lap that is not the best.

Verifier (none): This only happens if another tab writes the same key while a race is running. That is outside the spec, which defines the stored best as what is in storage when the race starts. Re-reading storage on every lap would be new behaviour, not a fix for anything the spec requires.

### R5-1 · major · dropped

`src/ui/race-ui.ts`:83: The tests treat the chip as visible whenever aria-hidden is not "true", but aria-hidden is "false" in both the 'out' and 'back' phases. So nothing checks that the chip is still slid out at lapEnd + STILL_OUT, which is what AC4 asks for. If the chip slides back too early, every test still passes, even though in the browser it would be hidden behind BEST (and visibility:hidden under reduced motion).

Verifier (none): This is a missing test, not a bug: the branch code shows the chip correctly during the slide-out window. No test can fail on this branch because of it, so there is nothing to fix.

### R5-2 · major · dropped

`src/ui/hud.ts`:157: The class toggles are the only thing that makes the chip appear on screen: CSS keeps `.ui-hud-new-best` at visibility:hidden unless it has `.is-out`/`.is-back`. No test checks them. If they are removed, the NEW BEST chip never shows in the game, yet AC4, AC7 and AC8 all still pass because they only look at aria-hidden.

Verifier (none): This only describes a mutation the tests wouldn't catch. The shipped code toggles the classes correctly, so no failing test is possible and there is no defect to fix.

### R5-3 · minor · dropped

`src/ui/race-ui.ts`:257: The spec says 'A race UI with no track id saves nothing', but no test covers it. If the guard is weakened so the UI writes or reads under an undefined or empty id, the existing stages (which pass no trackId and default to localBestLaps) would read and write the real browser localStorage, and no test would fail.

Verifier (none): The guard behaves as the spec says. The finding only points out a coverage gap under a hypothetical mutation, with no bug on this branch.
