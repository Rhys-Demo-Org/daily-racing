# Gates: PASS

Branch `46f3f34bf8b2` vs main `ed4049838563` (maintenance), 17.9 s

| Gate | Result | Time | Summary |
|---|---|---|---|
| G1 Build, types & unit tests | pass | 17.6 s | typecheck, build ok; 718/718 tests passed (main 716) |
| G2 Bot laps | pass | 1.7 s | bends 15.48 s (+0.0%), dust-bowl 17.70 s (+0.0%), hay-loop 53.61 s (new); worst step 0.406 |
| G3 Physics replays | pass | 1.1 s | 5 replays reproduce main's end states (exact) |
| G8 Protected files | pass | 0.6 s | only allowed paths changed; manifest and tokens match |
| P1 Screens unchanged (DOM + styles) | pass | 13.1 s | 22 stage snapshot(s) (DOM + computed styles) identical to main |
| P2 Scene geometry unchanged | pass | 2.4 s | geometry identical to main: 3 track scene(s) and 6 car(s), 427 objects |

| M1 Maintenance limits | pass | - | 9 files, 134 lines, net src +16 (limits 40 / 1500 / ≤ 150) |
