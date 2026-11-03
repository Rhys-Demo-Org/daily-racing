
## Tonight is a maintenance night
- Change no behaviour: the gates fail your fix on any difference from `main` in bot laps, replays,
  a screen stage's DOM or computed styles (P1), or a scene's geometry (P2), and the harness drops it.
- Net `src/` growth over the whole branch is capped (gate M1; the spec gives the limit) and is for
  performance items only: prefer deleting code to adding it.
- Existing tests stay append-only; add new test files only.
