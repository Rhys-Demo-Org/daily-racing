# Vision

A browser arcade racer that an AI builds one day at a time.

**The game.** Short, chaotic dirt-track races in the spirit of the original *Reckless Racing*: chunky
toy cars, big drifts, jumps, hay bales and tyre stacks, three-lap sprints that take a couple of
minutes. Seen from a fixed, tilted three-quarter "tabletop diorama" camera that never rotates.
Mobile-first (landscape, touch steering, 30fps+ on a mid-range Android), playable on desktop with
keyboard or gamepad, installable as a PWA.

**The look.** A 70s rally toy diorama. Ten colours, no more. Low-poly meshes built in code, flat
toon shading in three hard steps, ink outlines on everything. UI is painted tin: flat fill, ink
outline, solid offset shadow. No textures, gradients, glow or fades, ever. The rules live in
`guardrails/design/UI_RULES.md` and are strict.

**The experiment.** Every night an AI agent ships one new feature or level as a pull request. The
owner reviews and merges. Nothing else is human-made: code, geometry, ideas and tests are all
produced by AI.

1. **Phase 0 (now):** interactive sessions build a small playable core and the harness that lets
   nightly runs build, test and judge themselves.
2. **Phase 1:** nightly runs work through `guardrails/BACKLOG.md`: the rest of the design
   (pause, results, title/track select, desktop HUD, more cars and tracks).
3. **Phase 2:** once the backlog is merged, each night the agent invents something new that is
   not in the design or backlog, while obeying every style rule.

**What "good" means.** Each day's change is small, fun, looks like it belongs, and leaves the game
better than it found it. The harness assumes the builder will take any shortcut that turns the
checks green, so the checks are scripted, run from `main`, and out of the builder's reach.
