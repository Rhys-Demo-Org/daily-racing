## Your focus: R3, duplication and dead code (maintenance)
Tonight's items claim to remove duplication or dead code. Don't take the diff's word for it: check
the whole of `src/`, not only the changed files. `/inputs/inventory.md` lists every export and
`/inputs/clones.md` the repeated code involving a changed file.
- **For every dedupe or dead-code item in `/inputs/spec.md`**, Grep all of `src/` (and `tests/`) for
  the names, literals and shapes the item removes: a copy left in another file, a re-export, a CSS
  block repeated elsewhere, a caller still using the old helper. Any remaining copy or reference is
  a finding (the item is half done).
- **Newly dead code.** For every function, export, CSS class or constant the diff stopped using,
  Grep for its remaining users. One with none left, and not removed, is a finding.
- **The kept copy's layer.** Where two copies became one, check the survivor sits in the right
  layer for `CLAUDE.md`'s layout (no `src/sim` importing render or DOM code, no UI reading the sim
  directly, materials only in `src/render/materials`). A survivor in the wrong layer is a finding.
- New parallel copies the diff itself adds.
Record in `checked` every item and name you grepped for and what you found, findings or not.
