## Your focus: R3, duplication and dead code
Use `/inputs/inventory.md` (everything `src/` exports) and `/inputs/clones.md` (repeated code
involving a changed file), then read the diff:
- New code that re-implements something an existing export already does: point to the export to
  reuse (file and name).
- Parallel copies inside the diff: two near-identical functions, components or CSS blocks.
- Dead or superseded code: old modules, panels or helpers the feature replaced but left in place,
  exports nothing imports, unreachable branches.
- Repeating merged or in-flight work in `/inputs/existing-work.md`.
Only flag duplication where reuse is clearly better: the fix must make the code smaller or simpler.
