## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
6 findings, 2 verified, 4 dropped; 2 fixes kept after the gates.

### R2-1 · minor · verified

`src/input/gamepad.ts`:35: connectedPads() only guards against navigator.getGamepads being absent. Per the Gamepad spec the method throws a SecurityError when the gamepad permissions policy blocks it, e.g. the game embedded in a cross-origin iframe without allow="gamepad". The throw is uncaught, so keyboard and touch players lose all input and the race never ticks.

Verifier (test): The Gamepad spec makes getGamepads() throw SecurityError when the permissions policy blocks it. The throw is uncaught, so keyboard input dies too, which goes against AC4's intent that an unavailable API is ignored. Wrapping the call in try/catch makes the test pass.

Fix: fixed in `8218467b15e5`. In src/input/gamepad.ts connectedPads(), the navigator.getGamepads() call is now wrapped in try/catch. On a throw it returns [], exactly like the existing guard for a missing API. The throw is the SecurityError the browser raises when the gamepad permissions policy blocks the API, for example in a cross-origin iframe without allow="gamepad". readGamepads() and the confirm-edge poll both go through connectedPads(), so input.read() and input.confirmPressed() no longer throw. Keyboard and touch keep working, and frame() keeps ticking. When getGamepads works, nothing changes. Added the verifier's test as tests/input/gamepad-blocked.test.ts. It failed before the fix and passes after it. pnpm typecheck is clean and pnpm test passes (82 files, 623 tests). Tests: `tests/input/gamepad-blocked.test.ts`. Kept: the gates pass with it.

### R2-2 · minor · dropped

`src/input/gamepad.ts`:51: readGamepads() adds the analogue steer of every connected standard pad. If one physical controller is exposed twice (a driver or Steam Input virtual copy, both with mapping 'standard'), the stick effect doubles: half tilt saturates to full lock and gentle pushes turn twice as hard. Only the boolean buttons are safe to OR across pads.

Verifier (none): This depends on a duplicate virtual pad, which is a speculative setup, and the fix would change the agreed merge behaviour. That is a design preference, not a reproduced defect against the spec.

### R3-1 · minor · verified

`src/input/index.ts`:56: The diff writes the same −1…+1 steer clamp twice: as `clampSteer` in gamepad.ts and again inline in index.ts. These are the only two `Math.max(-1, Math.min(1, …))` lines in src/.

Verifier (trace): The diff adds the same steer clamp twice, in the same module family. Reusing the existing helper changes no behaviour.

Fix: fixed in `d7998793a5ad`. Removed the duplicated −1…+1 steer clamp. `clampSteer` in src/input/gamepad.ts is now exported, and src/input/index.ts imports it and uses it in read() (`const steer = clampSteer((right ? 1 : 0) - (left ? 1 : 0) + p.steer);`) in place of its own inline `Math.max(-1, Math.min(1, …))`. Both versions compute the same thing, so behaviour doesn't change. This is a duplication fix, so there is no red/green test; the existing gamepad, keyboard and touch input tests cover it. pnpm typecheck passes and pnpm test passes (82 files, 623 tests). Kept: the gates pass with it.

### R3-2 · minor · dropped

`src/input/gamepad.ts`:7: `PAD_BUTTON`, `STICK_DEAD_ZONE`, `stickSteer`, `PadState` and `ConfirmEdge` are exported, but nothing outside gamepad.ts imports them. index.ts imports only `createConfirmEdge` and `readGamepads`, and neither new test imports gamepad.ts at all.

Verifier (none): This is a style preference. Exporting a module's public constants and types is normal, harmless and has no behavioural effect.

### R5-1 · minor · dropped

`src/input/gamepad.ts`:56: No test checks that the dead-zone edge is at 0.15. The tests only sample 0.15 (must be 0) and 0.2 (must be in (0, 0.1)), so moving STICK_DEAD_ZONE anywhere in about 0.15…0.19 passes every test, even though the spec sets the dead-zone at 0.15.

Verifier (none): There is no defect on this branch, so no test fails. A coverage gap isn't a bug to fix.

### R5-2 · minor · dropped

`src/game.ts`:211: The spec says A activates the *focused* button, but no test moves focus off the primary button. The focused-button branch and its `menu.contains(focused)` guard can be removed or broken and every test still passes, for example with focus on the results screen's RETRY button.

Verifier (none): The code behaves correctly, so no failing test is possible. This is a test-coverage suggestion, not a defect.
