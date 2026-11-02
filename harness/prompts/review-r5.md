## Your focus: R5, test strength
Read every test the diff adds:
- Trivial assertions: `toBeDefined`, `toBeTruthy`, checking a mock was called, snapshotting
  whatever the code produces, asserting a value the test itself just set.
- Tests that would still pass if the feature were broken or missing: name the mutation of the
  source (a changed constant, a removed line, a flipped condition) that the tests don't catch.
- Tests that pin internal names instead of a public seam, or depend on timing, order or
  randomness.
- Acceptance criteria or important branches with no test.
For each finding, the evidence is the mutation (file, line, change) that survives, or the
behaviour left untested.
