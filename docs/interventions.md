# Owner interventions log

Every manual intervention by the owner (Rhys) in the nightly pipeline: merges, decisions, design
answers, backlog edits, owner PRs and direct fixes. Agents working with the owner append an entry
for each one, newest last. Nightly runs never edit this file.

Entries before 2026-11-23 were reconstructed from git/PR history and agent memory, so they may be
incomplete.

| Date | Kind | What | Why / link |
|---|---|---|---|
| 2026-10-28 | process | Owner asked for the Phase 0 plan to be pushed straight to `main`. Plans live in `plans/` and aren't implemented until the owner says so. | The owner reviews plans as repo files (`plans/phase0-plan.md`). |
| 2026-10-29 | decision | Approved the backlog B01–B12, including the B11 lock rule and no settings button on S6. Approved the UI_RULES §9 toon thresholds (≥ 0.7 / ≥ −0.6 / below). | Phase 0 M1 checkpoint. |
| 2026-10-29 | process | Every milestone gets a spec audit plus a code review (speed, LOC, duplication), with fixes applied before handover. | Owner instruction when starting M3. |
| 2026-10-30 | ops | Had the nightly timer installed (02:00 London) to start the dry-run week, then cut the week short to open real PRs early. | `plans/live-prs.md` |
| 2026-11-02 | ops | Live mode, so nightly runs open PRs. | [#8](https://github.com/Rhys-Demo-Org/daily-racing/pull/8) |
| 2026-11-02 | merge | Merged B01 pause screen and B02 results screen. | [#9](https://github.com/Rhys-Demo-Org/daily-racing/pull/9), [#10](https://github.com/Rhys-Demo-Org/daily-racing/pull/10) |
| 2026-11-02 | harness | Raised the nightly size limit to 20 changed files. | [#12](https://github.com/Rhys-Demo-Org/daily-racing/pull/12) |
| 2026-11-02 | process | "Cost isn't really a factor": use a separate, independent agent per stage. This led to M1a: plan audit, R1–R5 review, verify/fix, blind judge, screen stages. | [#13](https://github.com/Rhys-Demo-Org/daily-racing/pull/13) |
| 2026-11-02 | test fix | Let a second track be registered (next-track AC8), and added a short test track. | [#14](https://github.com/Rhys-Demo-Org/daily-racing/pull/14), [#15](https://github.com/Rhys-Demo-Org/daily-racing/pull/15) |
| 2026-11-02 | merge | Merged B03 AI liveries and driver roster. | [#11](https://github.com/Rhys-Demo-Org/daily-racing/pull/11) |
| 2026-11-02 | content | Made Dust Bowl smaller and tighter, wide enough for 3 cars, and froze the classic layout for tests. | [#16](https://github.com/Rhys-Demo-Org/daily-racing/pull/16) |
| 2026-11-02 | harness | Added the Sunday maintenance night (survey, cleanup list, refactor). | [#17](https://github.com/Rhys-Demo-Org/daily-racing/pull/17) |
| 2026-11-03 | harness | Sundays may grow `src/` by up to 150 lines for performance items. Agents get 2× headroom on turn and time caps. | [#18](https://github.com/Rhys-Demo-Org/daily-racing/pull/18), [#19](https://github.com/Rhys-Demo-Org/daily-racing/pull/19) |
| 2026-11-03 | ci fix | Run CI in the harness's Playwright image, which fixed #20's missing preview. The driver now races the six-car grid. | [#21](https://github.com/Rhys-Demo-Org/daily-racing/pull/21), [#22](https://github.com/Rhys-Demo-Org/daily-racing/pull/22) |
| 2026-11-03 | merge | Merged B04 six-car grid. | [#20](https://github.com/Rhys-Demo-Org/daily-racing/pull/20) |
| 2026-11-12 | fix | Countdown camera offsets, so the player's car stays visible until GO! has gone. | [#23](https://github.com/Rhys-Demo-Org/daily-racing/pull/23) |
| 2026-11-12 | merge | Merged B05 desktop HUD, B06 gamepad, B07 best lap, B10 Hay Loop and the 11-08 maintenance night. | [#24](https://github.com/Rhys-Demo-Org/daily-racing/pull/24)–[#28](https://github.com/Rhys-Demo-Org/daily-racing/pull/28) |
| 2026-11-16 | test + rebaseline | Added an end-to-end test for best lap and NEW BEST, and rebaselined after merging #23–#28. | [#29](https://github.com/Rhys-Demo-Org/daily-racing/pull/29) |
| 2026-11-16 | merge | Merged B08 title/track select, B09 HUD motion, the 11-15 maintenance night and B12 pickups. | [#30](https://github.com/Rhys-Demo-Org/daily-racing/pull/30)–[#33](https://github.com/Rhys-Demo-Org/daily-racing/pull/33) |
| 2026-11-16 | backlog | Added B13 (rivals use pickups) ahead of B11, and edited the B12 tests that asserted AI never collects. | [#34](https://github.com/Rhys-Demo-Org/daily-racing/pull/34) |
| 2026-11-23 | merge | Merged B13 rivals use pickups and the 11-22 maintenance night. The pipeline had been skipping since 11-19 because every open item waited on unmerged PRs. | [#35](https://github.com/Rhys-Demo-Org/daily-racing/pull/35), [#37](https://github.com/Rhys-Demo-Org/daily-racing/pull/37) |
| 2026-11-23 | design | Answered #36's design requests. The card row shrinks to fit (min 96px), then scrolls with snap points. A locked card keeps the S6 shadow and never lifts or sinks. Locked shake: ±4px, 3 swings, 250ms, snap easing, none under reduced motion. Written into UI_RULES §12, with a new backlog item B14 to build it. | `guardrails/design/UI_RULES.md` §12, `guardrails/BACKLOG.md` B14 |
| 2026-11-23 | content | Pine Ridge must be the fourth (last) track, not third: a locked track before an unlocked one makes no sense. Renamed `forest-ridge` to `pine-ridge` so file order puts it last, and updated the tests that assumed the last card can be selected. Replaces #36. | B11 replacement PR (owner/b11-pine-ridge-fourth) |
| 2026-11-23 | process | Started this log. Every manual intervention from the owner is logged here from now on. | Owner instruction |
