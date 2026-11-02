# B03 · AI liveries and driver roster

Date: 2026-11-02 · mode: backlog · backlog: B03

## Summary

Add a data-only roster at `src/content/drivers.ts`: YOU #1 (rally-red, cream stripe) and five AI drivers with stripes from concept frame B. KOSKI #7 is mustard with navy, BRUNO #23 navy with mustard, DEL RIO #4 teal with cream, MAGS #9 cream with rally-red, OTTO #12 grass with cream. It also gives the drivers for an N-car race: the player plus the first N−1 AI entries. `src/game.ts` drops its hard-coded LIVERIES and uses the roster, so the bot is KOSKI #7; the car builder in `src/render/car.ts` is reused unchanged. The B02 results table's DRIVER column shows the roster names ("KOSKI · #7").

## Acceptance criteria

- **AC1**: `src/content/drivers.ts` exports a `ROSTER` of exactly six entries, in this order and with these exact values for name, number, body, stripe and player: YOU 1 rally-red cream true; KOSKI 7 mustard navy false; BRUNO 23 navy mustard false; DEL RIO 4 teal cream false; MAGS 9 cream rally-red false; OTTO 12 grass cream false. Every entry passes `validateLivery`.
- **AC2**: No AI roster entry (player false) has a rally-red body. Exactly one entry is the player, and the five AI bodies are distinct and together equal the set in `tokens.cars.ai`.
- **AC3**: For each roster entry, `buildCarGeometry(entry)` vertex colours use exactly these palette indices (`PALETTE` order): body, stripe, cabin and ink wheels. Cabin is navy, except teal for BRUNO's navy body. `buildRoundelGeometry(entry.number)` uses only cream and ink. `buildCar(entry)` has a ▼ marker for YOU only.
- **AC4**: The navy roster car (BRUNO #23) builds a body whose cabin faces carry the teal palette index and no navy cabin faces. Every other roster car's cabin is navy.
- **AC5**: The roster module exports a function that returns the drivers for an N-car race. For N = 2 it returns [YOU #1, KOSKI #7]: the player first, then the first AI roster entry. `src/game.ts` builds its scene liveries, minimap colours and driver labels from it and no longer defines its own livery literal.
- **AC6**: The results screen's DRIVER column names each car from the roster as "<NAME> · #<number>", in sim race-position order, with the player's row as "YOU · #1" (still the rally-red row). `RaceUi.reset`'s race info takes optional `driverNames`, index-aligned with the cars; `src/game.ts` passes the roster names and numbers, so a finished 2-car race lists "YOU · #1" and "KOSKI · #7" and never "CPU".
- **AC7**: Without `driverNames` the table keeps the generic "YOU" / "CPU" labels from B02. The old finish panel gets no driver list (it is no longer used by the game).

_Reworked 2026-11-02 onto main after B01 (pause) and B02 (results screen) merged: AC6/AC7 originally targeted the old finish panel; they now target the B02 results table. Tests: `tests/ui/results-drivers.test.ts`, `tests/game/results-drivers.test.ts`._
