## Your focus: R2, correctness and determinism
Hunt for real bugs in the diff and the code it touches:
- State that leaks between races, restarts, pauses or screens; stale view models or stale order.
- Event listeners, timers, animation frames or DOM nodes that are added but never removed.
- Input: touch and keyboard paths, focus, events passing through overlays to controls underneath.
- Edge cases: zero, one or many cars, last lap, ties, wrap-around, empty or missing data,
  off-by-one in counts and labels (e.g. "1 LAPS").
- Determinism: the sim must be a pure function of seed and inputs. No `Math.random`, `Date`, wall
  clock or rendering state inside `src/sim`; the loop keeps fixed 60 Hz steps; replays and bot laps
  must not change for existing tracks.
For each finding give the exact sequence of events or inputs that triggers it.
