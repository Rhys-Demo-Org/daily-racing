## Your area: duplication across the whole codebase
Cross-cutting: use `/inputs/clones.md` (repeated code) and `/inputs/inventory.md` (every export) to
find parallel copies: two helpers doing the same job in different modules, repeated CSS blocks,
repeated constants, near-identical functions. For each, show both copies with `file:line` and name
the one to keep. Only report duplication whose removal makes the code smaller or simpler without
changing behaviour.
