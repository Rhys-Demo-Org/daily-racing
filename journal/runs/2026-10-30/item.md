## B01 · Pause screen (S4)
depends_on: none
scope: Pause button (top-right HUD stack, beside TIME) and Esc key. Ink hatch overlay wipes in
over the frozen scene, then the PAUSED card drops in: navy header with "LAP x/3 · m:ss.cc", the
triple stripe, and three buttons: RESUME (rally-red, focused), RESTART RACE (cream), QUIT TO MENU
(navy). The simulation stops stepping while paused; touch controls go back to active on resume.
Mockup: `mockups/S4-pause.png`; motion: board 05.
done_when: pausing freezes sim time and race timer; resume continues from the identical state;
restart starts a fresh countdown on the same track; quit returns to the start screen; Esc and the
HUD button both toggle pause.
