# B06 · Gamepad controls

Date: 2026-11-05 · mode: backlog · backlog: B06

## Summary

Add standard-mapping gamepad support through the Gamepad API (`navigator.getGamepads()`), polled each time the game reads input for a sim step and merged into the same `CarInput` as keyboard and touch. Left stick X steers analogue across −1…+1, rescaled past a 0.15 dead-zone so a resting stick gives exactly 0. D-pad left/right steer −1/+1, right trigger (button 7) is gas and left trigger (button 6) brake/reverse. Steer is clamped to −1…+1 when combined with keys or touch. On menus, a fresh press of A (button 0) activates the focused button of the visible menu screen: RACE on the start screen, NEXT RACE on the results screen. Holding A never repeats, and A does nothing to the car mid-race. The pause screen is out of scope tonight because the game loop is stopped while paused.

## Acceptance criteria

- **AC1**: With `navigator.getGamepads()` mocked to return one connected pad with mapping 'standard', the combined input's read() gives the same CarInput as the equivalent key: d-pad left (button 14) = ArrowLeft {steer:-1,throttle:false,brake:false}, d-pad right (15) = ArrowRight, right trigger (7) = ArrowUp, left trigger (6) = ArrowDown.
- **AC2**: Left stick X (axes[0]) steers analogue: −1 reads steer −1 and +1 reads steer +1, exactly as ArrowLeft/ArrowRight do. 0.6 gives a steer strictly between 0 and 1 and larger than 0.4 does. −0.6 gives the negation of 0.6.
- **AC3**: Stick dead-zone: when |axes[0]| ≤ 0.15 (e.g. 0.12, −0.1, 0.15), read() gives steer exactly 0 with no buttons pressed, so a resting stick never drifts. Just past it (0.2), steer is above 0 and below 0.1.
- **AC4**: Triggers are boolean: a trigger reading value 1 (pressed true) counts as held, and one reading value 0.1 (pressed false) does not. Gamepad steer combined with a held arrow key stays within −1…+1. Pads whose mapping isn't 'standard', null slots and a missing `navigator.getGamepads` are ignored, and keyboard input still works.
- **AC5**: On the start screen, with a mocked pad, pressing A (button 0) and running an animation frame starts a race: state().mode becomes 'race' with six cars, the same as tapping RACE.
- **AC6**: A acts only on a fresh press. If A is still held from the start screen when the race begins, nothing more is triggered. Once the player has finished and the results screen shows, A held across frames does nothing until it is released and pressed again, which then activates NEXT RACE (a new race on the next track).
- **AC7**: During a race with no menu screen showing, pressing A changes nothing: the player's CarInput keeps steer 0 with throttle and brake false, and the game stays in the race, not paused.

## What you'll see

A game controller now drives the car. The left stick steers smoothly, so small pushes give gentle turns, and the d-pad steers fully left or right. The right trigger is gas and the left trigger brakes and reverses. The A button presses RACE on the start screen and NEXT RACE on the results screen.

## How to play-test

1. Pair a Bluetooth game controller (Xbox or PlayStation style) with your phone, or plug one into a computer, then open the preview.
2. Press any button on the controller so the browser notices it, then press A on the start screen. A race should start.
3. Leave the stick alone during the countdown and the race. The car should not creep left or right on its own.
4. Hold the right trigger to drive and steer with the left stick: small pushes should turn gently and full pushes sharply. Try the d-pad too, and use the left trigger to brake and reverse.
5. Finish the race. On the results screen, press A: it should start the next race. Holding A down should not keep skipping screens.

## Expected files

- `src/input/gamepad.ts`
- `src/input/index.ts`
- `src/game.ts`
- `tests/input/gamepad.test.ts`
- `tests/game/gamepad-menu.test.ts`

## Plan audit

Verdict: **approve** (round 1)

The draft covers all of B06: steering with the stick and d-pad mapped onto the existing steer range, both triggers, a dead-zone, and A to confirm on menus, with input merged into the same CarInput. Every criterion can be tested in Node through existing seams: createInput().read(), a mocked navigator.getGamepads, and the happy-dom game harness with requestAnimationFrame driven by hand. The overlap with #23 in src/game.ts is in different functions, so it is safe to build tonight. The only findings are minor notes for the builder.

- minor · testability: The harness lint flags AC1 for naming navigator.getGamepads. That is the browser's public Gamepad API, not a repo internal, and tests have to mock it anyway. The criteria also use the combined input's read(), which is the exported createInput() seam that tests/input/keyboard.test.ts and touch.test.ts already pin. Neither name is a problem. Fix: No change. Mock the pad through navigator.getGamepads with vi.stubGlobal, or define it on navigator, and read through createInput().read().
- minor · testability: AC7 says 'the player's CarInput keeps steer 0', but CarInput isn't exposed by state(). During the countdown the car can't move, so that check would pass anyway. Fix: Test AC7 in two ways. First, createInput().read() with only A held returns {steer:0, throttle:false, brake:false}. Second, in the game harness after GO, with A held and no other input, state().cars[0] matches a no-input race at the same tick, mode stays 'race' and paused stays false.
- minor · scope: The backlog says 'A to confirm on menus', and the pause screen is a menu, but the draft leaves it out because the loop stops while paused. done_when only requires 'menus can be started with A', which RACE and NEXT RACE meet, so this is acceptable. Still, the owner may press A on the pause screen during the play-test and see nothing happen. Fix: The builder must not quietly add pause support. Note the gap in the PR summary so the owner knows A doesn't resume yet. Pause support can be a follow-up item.
- minor · other: The menu A-poll has to run in frame() before the `mode !== 'race'` early return, because the loop keeps running on the menu but returns right away. Releases also have to be tracked across that path so the fresh-press rule in AC6 holds when the mode changes. Fix: Keep one 'A was down last frame' flag that frame() updates on every call, whatever the mode. Fire only on a press edge, and only while an overlay is visible: the start screen, or the results screen once the player has finished.
- minor · overlap: #23 changes draw() and play() in src/game.ts. This draft touches frame() and the input wiring, which are different hunks. Fix: Don't edit draw() or play(). Put the menu A-poll in frame() or a separate helper so either PR can rebase cleanly.

Overlap with open PRs: #23 (countdown camera offset) changes src/game.ts only in draw(), where it adds a countdownClearance argument to scene.update, and in play(), where it changes a scene.update call. This draft adds gamepad polling inside createInput().read(), which is src/input, and a menu A-poll in frame() or a helper. That means different functions and different lines, and neither feature depends on the other's behaviour: gamepad input only changes the player's CarInput and menu activation, not the camera or the countdown. A textual conflict is unlikely, and if one happens it is a trivial rebase. Safe to build now.
