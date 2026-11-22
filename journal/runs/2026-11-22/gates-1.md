# Gates: PASS

Branch `7e41fb00efe0` vs main `37f6e3d82cb0` (maintenance), 33.0 s

| Gate | Result | Time | Summary |
|---|---|---|---|
| G1 Build, types & unit tests | pass | 32.6 s | typecheck, build ok; 813/813 tests passed (main 813) |
| G2 Bot laps | pass | 1.9 s | bends 15.48 s (+0.0%), dust-bowl 17.70 s (+0.0%), hay-loop 53.61 s (+0.0%); worst step 0.406 |
| G3 Physics replays | pass | 1.2 s | 5 replays reproduce main's end states (exact) |
| G8 Protected files | pass | 0.7 s | only allowed paths changed; manifest and tokens match |
| P1 Screens unchanged (DOM + styles) | pass | 24.6 s | 56 stage snapshot(s) (DOM + computed styles) identical to main |
| P2 Scene geometry unchanged | pass | 2.5 s | geometry identical to main: 3 track scene(s) and 6 car(s), 454 objects |

| M1 Maintenance limits | pass | - | 14 files, 87 lines, net src -10 (limits 40 / 1500 / ≤ 150) |
