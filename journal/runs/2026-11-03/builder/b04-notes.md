# B04 · Six-car grid: builder notes

- `startRace` takes an optional `carCount` (1–6, default 2). RACE, RETRY, RESTART RACE and NEXT RACE pass 6.
  The cached race scene is now keyed on track id and driver count, so it is rebuilt whenever the
  driver list changes.
- Grid (plan audit, finding 2): slots 4 and 5 (index ≥ 4, which only six-car races use) were too
  close to props. The track curves behind the start line, so the straight-back slot drifted
  sideways: about 1.5 units from a tyre wall on Bends (slot 4) and from a tree on Dust Bowl
  (slot 5). In `createWorld`, slots with index ≥ 4 now follow the centreline back, face along it,
  and use ±1.5 columns instead of ±2. They are now more than 3 units clear of every collider on
  both tracks for seeds 1–20. Slots 0–3 and the order of RNG draws are unchanged, so existing
  replays and lap times don't move.
- Not changed, for the owner: on Bends, slot 2 (used by 3- and 4-car races) sits about 1.8 units
  from a tyre-wall collider, and for some seeds the car's outer edge reaches about 0.2 past the
  road edge (its centre is still on dirt). Fixing it would move existing grids, so the AC1 test
  checks props and the road edge only for the new slots 4–5.
- AC6 uses one fixed seed (7) for both tracks. Its five AI finish ticks are distinct.
- The driver (`window.__racer.startRace`) still starts 2-car races, so gate races and screenshots
  show 2 cars (see the audit's change request).
- Play-test addition: pause and tap RESTART RACE: still six cars.
