// Chooses tonight's work (HANDOVER §6.2 step 2): Sunday maintenance, else the Phase 1 backlog item.
// Parses guardrails/BACKLOG.md in its documented format. Dry runs merge nothing, so a ledger of
// items already tried rotates through the unblocked ones instead of picking B01 every night. Live
// runs take their state from the repo's daily PRs instead (prState) and never rotate.

/** One backlog entry. `text` is its full markdown block, handed to the ideate agent. */
export type BacklogItem = { id: string; title: string; dependsOn: string[]; scope: string; doneWhen: string; text: string };

/** Tonight's work. `tried` is the updated dry-run ledger list (backlog only). */
export type Work =
  | { kind: 'maintenance' }
  | { kind: 'phase2' }
  | { kind: 'blocked' }
  | { kind: 'backlog'; item: BacklogItem; tried: string[] };

/** Parses BACKLOG.md; throws on anything that breaks the documented format. */
export function parseBacklog(md: string): BacklogItem[] {
  const blocks = md.split(/^(?=## )/m).filter((b) => b.startsWith('## '));
  const items = blocks.map((block): BacklogItem => {
    const head = /^## (B\d\d) · (.+)/.exec(block);
    if (!head) throw new Error(`BACKLOG.md: bad heading "${block.split('\n')[0]}"`);
    const field = (key: string): string => {
      const m = new RegExp(`^${key}:([\\s\\S]*?)(?=^(?:depends_on|scope|done_when):|(?![\\s\\S]))`, 'm').exec(block);
      if (!m) throw new Error(`BACKLOG.md: ${head[1]} has no ${key}`);
      return m[1]!.trim().replace(/\s*\n\s*/g, ' ');
    };
    const deps = field('depends_on');
    return {
      id: head[1]!,
      title: head[2]!.trim(),
      dependsOn: deps === 'none' ? [] : deps.split(',').map((d) => d.trim()),
      scope: field('scope'),
      doneWhen: field('done_when'),
      text: block.trim(),
    };
  });
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) throw new Error('BACKLOG.md: duplicate ID');
  for (const i of items) for (const d of i.dependsOn) if (!ids.has(d)) throw new Error(`BACKLOG.md: ${i.id} depends on unknown ${d}`);
  return items;
}

/** A daily PR as `gh pr list --json state,labels` reports it. */
export type DailyPr = { state: string; labels: { name: string }[] };

/**
 * Backlog state from the daily PRs, by their `backlog:Bxx` label: a merged PR's item is done; an
 * open or closed-unmerged PR's item counts as tried, so live runs never pick it again.
 */
export function prState(prs: readonly DailyPr[]): { merged: Set<string>; tried: string[] } {
  const merged = new Set<string>();
  const tried = new Set<string>();
  for (const pr of prs) {
    for (const { name } of pr.labels) {
      const id = /^backlog:(B\d\d)$/.exec(name)?.[1];
      if (id) (pr.state === 'MERGED' ? merged : tried).add(id);
    }
  }
  return { merged, tried: [...tried].filter((id) => !merged.has(id)) };
}

/**
 * Sunday → maintenance. Every item merged → phase 2. Otherwise the first unblocked item (not
 * merged, every dependency merged) not yet in `tried`; when all have been tried, start over
 * (dry runs) or report blocked (`rotate` false, live runs).
 */
export function chooseWork(sunday: boolean, items: BacklogItem[], merged: ReadonlySet<string>, tried: readonly string[], rotate = true): Work {
  if (sunday) return { kind: 'maintenance' };
  if (items.every((i) => merged.has(i.id))) return { kind: 'phase2' };
  const open = items.filter((i) => !merged.has(i.id) && i.dependsOn.every((d) => merged.has(d)));
  const fresh = open.find((i) => !tried.includes(i.id));
  const item = fresh ?? (rotate ? open[0] : undefined);
  if (!item) return { kind: 'blocked' };
  return { kind: 'backlog', item, tried: fresh ? [...tried, item.id] : [item.id] };
}
