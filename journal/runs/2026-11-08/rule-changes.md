## CLAUDE.md and agent-rule changes

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index a746aaf..99bf003 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -36,7 +36,7 @@ on Sundays (maintenance). Everything else is protected and only the owner change
 - Opponents are `createBot(world, i)` (`src/sim/bot.ts`): each returns the same `CarInput` as the
   player every tick, so a race is reproducible from the seed and the player's inputs, and the bot
   also drives the gates' bot laps.
-- `src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown and finish-panel updates.
+- `src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown, pause-screen and results-screen updates.
 - `src/driver/` installs `window.__racer` (start a race with a seed, freeze real time, step/play
   inputs, read state) for gates. It is protected; never special-case it in game code.
 
```

New rules or instructions the judge found:

- CLAUDE.md (changed description line, not a new rule): "- `src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown, pause-screen and results-screen updates."
- src/sim/car.ts maxStepUp doc comment (code comment, not a loaded agent file, but worded as a constraint): "It is part of the recorded replay behaviour (G3 baselines), so it must not change; a different step rule has to be opt-in per track, car or surface."
