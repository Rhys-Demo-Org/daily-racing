## CLAUDE.md and agent-rule changes

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 99bf003..99d0d56 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -30,7 +30,8 @@ on Sundays (maintenance). Everything else is protected and only the owner change
 
 ## How the game fits together
 - `src/game.ts` owns the loop: the sim steps in fixed 60 Hz ticks, render draws cars interpolated
-  between the last two ticks, and the UI receives view models (`src/ui/types.ts`), never the sim.
+  between the last two ticks, and the UI receives the sim's view types (`RaceView`, `CarView` from
+  `src/sim/types.ts`), never the World; race-ui builds its own view models (`src/ui/types.ts`) from them.
 - `src/sim/types.ts` is the contract between layers; import the sim only via `src/sim/index.ts`.
 - The sim computes all track geometry (`trackLayout`); render only draws it.
 - Opponents are `createBot(world, i)` (`src/sim/bot.ts`): each returns the same `CarInput` as the
```

New rules or instructions the judge found:

- CLAUDE.md (How the game fits together), changed line: "`src/game.ts` owns the loop: ... the UI receives the sim's view types (`RaceView`, `CarView` from `src/sim/types.ts`), never the World; race-ui builds its own view models (`src/ui/types.ts`) from them." It replaces "the UI receives view models (`src/ui/types.ts`), never the sim." This is the wording the spec asks for (C053), and it corrects the description to match the code.
