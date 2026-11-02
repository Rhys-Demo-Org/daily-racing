## Your focus: R1, the spec
For every acceptance criterion in `/inputs/spec.md`:
- Is it truly met by the code in the diff, for every case it names (not just the easy one)?
- Does a test named `AC<n>: …` really prove it? It must fail without the feature, assert the
  behaviour (not just that something exists), and go through a public seam (the DOM by role and
  text, `RaceView`, `window.__racer`, exported content data) rather than internal names.
- Is everything in the spec's `playtest` ("What you'll see", "How to play-test") actually true of
  the build?
- Were the modules under "Supersedes" really removed, and the plan audit's findings followed?
- Did the build add things the spec didn't ask for?
