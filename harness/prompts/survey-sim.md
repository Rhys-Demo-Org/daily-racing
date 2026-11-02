## Your area: sim (`src/sim/**`)
The deterministic simulation: physics, track geometry, bots, race state, replays. Look for dead
exports and branches, duplicated maths or geometry helpers, functions that can be simpler without
changing a single number, and comments or types that no longer match the code. Any change here must
leave every bot lap and replay bit-identical: never suggest reordering floating-point arithmetic,
changing constants or the RNG call order.
