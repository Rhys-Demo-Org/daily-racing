# B06 builder notes

- Gamepad A does **not** resume from the pause screen yet: the game loop is stopped while paused, so
  nothing polls the pad (out of scope per the spec; candidate follow-up).
- A activates the focused button of the visible menu screen, falling back to its primary button
  (RACE / NEXT RACE). Only standard-mapping pads are read.
- draw() and play() in src/game.ts are untouched (overlap with #23).
