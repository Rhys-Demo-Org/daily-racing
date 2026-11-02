# B03 · AI liveries and driver roster

Date: 2026-11-02 · mode: backlog · backlog: B03

## Summary

Add a data-only roster at `src/content/drivers.ts`: YOU #1 (rally-red, cream stripe) and five AI drivers with stripes from concept frame B. KOSKI #7 is mustard with navy, BRUNO #23 navy with mustard, DEL RIO #4 teal with cream, MAGS #9 cream with rally-red, OTTO #12 grass with cream. It also gives the drivers for an N-car race: the player plus the first N−1 AI entries. `src/game.ts` drops its hard-coded LIVERIES and uses the roster, so the bot is KOSKI #7; the car builder in `src/render/car.ts` is reused unchanged. `RaceUi.reset` gets optional driver labels, and the finish panel lists the cars by position as "NAME · #n" (S5). The full S5 results screen stays in B02.

## Acceptance criteria

- **AC1**: `src/content/drivers.ts` exports a `ROSTER` of exactly six entries, in this order and with these exact values for name, number, body, stripe and player: YOU 1 rally-red cream true; KOSKI 7 mustard navy false; BRUNO 23 navy mustard false; DEL RIO 4 teal cream false; MAGS 9 cream rally-red false; OTTO 12 grass cream false. Every entry passes `validateLivery`.
- **AC2**: No AI roster entry (player false) has a rally-red body. Exactly one entry is the player, and the five AI bodies are distinct and together equal the set in `tokens.cars.ai`.
- **AC3**: For each roster entry, `buildCarGeometry(entry)` vertex colours use exactly these palette indices (`PALETTE` order): body, stripe, cabin and ink wheels. Cabin is navy, except teal for BRUNO's navy body. `buildRoundelGeometry(entry.number)` uses only cream and ink. `buildCar(entry)` has a ▼ marker for YOU only.
- **AC4**: The navy roster car (BRUNO #23) builds a body whose cabin faces carry the teal palette index and no navy cabin faces. Every other roster car's cabin is navy.
- **AC5**: The roster module exports a function that returns the drivers for an N-car race. For N = 2 it returns [YOU #1, KOSKI #7]: the player first, then the first AI roster entry. `src/game.ts` builds its scene liveries, minimap colours and driver labels from it and no longer defines its own livery literal.
- **AC6**: `createRaceUi(...).reset(laps, outline, colours, drivers)` accepts an optional list of driver labels, index-aligned with the cars. When the race finishes, the finish panel lists every car in race-position order as "<NAME> · #<number>". For example, with the player in position 2 and KOSKI in position 1 it reads "KOSKI · #7" before "YOU · #1".
- **AC7**: Calling `reset` without driver labels (the existing three-argument form) still shows the finish panel with time and best lap and no driver list. Driver-list text uses only existing UI components and token classes, with no inline colours.
