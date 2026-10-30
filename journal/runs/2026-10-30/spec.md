# B01 · Pause screen (S4)

Date: 2026-10-30 · mode: backlog · backlog: B01

## Summary

Add a PAUSE button to the top-right HUD stack beside TIME; it and the Esc key toggle pause during a race. Pausing stops the real-time loop from stepping the sim. The ink hatch wipes in and the S4 card drops in: a navy header with "PAUSED" and "LAP x/3 · m:ss.cc", the triple stripe, then RESUME (rally-red, focused), RESTART RACE (cream) and QUIT TO MENU (navy). Build it from the existing overlay, hatch, panel and button components, with new pause and home icons. Expected files: new src/ui/pause-screen.ts plus CSS, hud.ts, icons.ts, race-ui.ts and game.ts (GameState gains `paused`). The driver's step()/play() are unchanged. Game tests run createGame under happy-dom with src/render/index.ts stubbed via vi.mock and requestAnimationFrame driven by hand.

## Acceptance criteria

- **AC1**: The race HUD's top-right stack contains a button with aria-label "Pause" in the same container as the TIME panel (.ui-hud__tr). Clicking it shows the pause overlay; clicking it again while paused hides the overlay.
- **AC2**: The pause overlay is hidden until pause. When shown it contains an ink hatch element and a dialog card whose header reads "Paused" and "LAP 2/3 · 1:24.36" for lap 2 of 3 at 84360 ms. The "LAP x/3 · m:ss.cc" part matches the HUD's current lap and time, and reads 0:00.00 during the countdown. The card also has a triple-stripe element below the header.
- **AC3**: The pause card has exactly three buttons, in this order: "Resume" (rally-red primary class), "Restart race" (cream) and "Quit to menu" (navy). The Resume button has document focus right after the overlay opens.
- **AC4**: In a running game (createGame, render stubbed), pressing Esc (keydown code "Escape") during a race sets state().paused to true. Further animation frames then leave state().race.raceTick and state().cars unchanged, including during the countdown. Pressing Esc again sets paused to false. Esc does nothing while on the menu.
- **AC5**: After resume (via the Resume button or Esc), state() deep-equals the snapshot taken at the moment of pausing, apart from paused=false, no matter how many frames passed while paused. The first animation frame after resume advances raceTick by at most 1, so paused time is never caught up.
- **AC6**: Resuming wakes the touch controls: a control that had gone to 'resting' before the pause is 'active' in ui.touch.machine right after resume.
- **AC7**: Restart race from the pause card starts a fresh race on the same track: state().trackId is unchanged, race.phase is 'countdown', race.raceTick is 0, paused is false, and the pause overlay is hidden.
- **AC8**: Quit to menu from the pause card returns to the start screen: state().mode is 'menu', paused is false, the start screen is visible, and the race layer and pause overlay are hidden.
