# Gates: PASS

Branch `5bf05bb5365e` vs main `ed4049838563` (maintenance), 19.2 s

| Gate | Result | Time | Summary |
|---|---|---|---|
| G1 Build, types & unit tests | pass | 18.9 s | typecheck, build ok; 716/716 tests passed (main 716) |
| G2 Bot laps | pass | 2.1 s | bends 15.48 s (+0.0%), dust-bowl 17.70 s (+0.0%), hay-loop 53.61 s (new); worst step 0.406 |
| G3 Physics replays | pass | 1.3 s | 5 replays reproduce main's end states (exact) |
| G8 Protected files | pass | 0.8 s | only allowed paths changed; manifest and tokens match |
| P1 Screens unchanged (DOM + styles) | pass | 13.9 s | 22 stage snapshot(s) (DOM + computed styles) identical to main |
| P2 Scene geometry unchanged | pass | 2.6 s | geometry identical to main: 3 track scene(s) and 6 car(s), 427 objects |

| M1 Maintenance limits | pass | - | 8 files, 86 lines, net src +12 (limits 40 / 1500 / ≤ 150) |
