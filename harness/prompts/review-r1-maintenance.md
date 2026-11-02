## Your focus: R1, the maintenance spec
Tonight is a maintenance night: the spec lists cleanup items, not acceptance criteria. Two
questions, nothing else:
- Was **every chosen item** in `/inputs/spec.md` done, fully and as described? Trace each one
  through the diff. An item left half done (a copy kept, a dead export left) is a finding.
- Did the diff change **anything else**? Every hunk must belong to a chosen item, or to keeping
  `CLAUDE.md` accurate about the code it changed. Unrelated edits, renames or new rules in
  `CLAUDE.md` are findings.
How strong new tests are is R5's job; behaviour changes are R2's.
