# Gates: PASS

Branch `e92033bc0dc2` vs main `90c5cfa198a6` (maintenance), 10.3 s

| Gate | Result | Time | Summary |
|---|---|---|---|
| G1 Build, types & unit tests | pass | 10.0 s | typecheck, build ok; 605/605 tests passed (main 603) |
| G2 Bot laps | pass | 1.7 s | bends 15.48 s (+0.0%), dust-bowl 17.70 s (+0.0%); worst step 0.405 |
| G3 Physics replays | pass | 1.3 s | 5 replays reproduce main's end states (exact) |
| G8 Protected files | pass | 0.7 s | only allowed paths changed; manifest and tokens match |
| P1 Screens unchanged (DOM + styles) | pass | 9.6 s | 16 stage snapshot(s) (DOM + computed styles) identical to main |
| P2 Scene geometry unchanged | pass | 2.1 s | geometry identical to main: 2 track scene(s) and 6 car(s), 240 objects |

| M1 Maintenance limits | pass | - | 8 files, 86 lines, net src -4 (limits 40 / 1500 / ≤ 150) |
