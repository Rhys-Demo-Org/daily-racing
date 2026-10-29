#!/usr/bin/env bash
# Morning report for a dry run: item, outcome, phases (wall clock against the deadlines, usage,
# notional cost), gate table per attempt, retries, abort reason, and the branch's diff vs main.
#
#   harness/scripts/dry-run-report.sh [YYYY-MM-DD] [--full]     (default: the latest run)
#
#   --full  print the whole diff instead of --stat
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"

date='' full=0
for arg in "$@"; do
  case $arg in --full) full=1 ;; 20[0-9][0-9]-[01][0-9]-[0-3][0-9]) date=$arg ;; *) echo "usage: dry-run-report.sh [YYYY-MM-DD] [--full]" >&2; exit 2 ;; esac
done
[[ -n $date ]] || date="$(ls "$DAILY_HOME/runs" 2>/dev/null | sort | tail -1)"
run="$DAILY_HOME/runs/$date"
[[ -n $date && -d $run ]] || { echo "dry-run-report.sh: no run ${date:-found} under $DAILY_HOME/runs" >&2; exit 1; }

ts_node report "$run"
clone="$DAILY_HOME/repo" branch="daily/$date"
if git -C "$clone" rev-parse -q --verify "$branch" >/dev/null; then
  base="$(git -C "$clone" merge-base origin/main "$branch")"
  echo; echo "## Diff $branch vs main (journal excluded)"; echo
  if (( full )); then git -C "$clone" --no-pager diff "$base" "$branch" -- . ':(exclude)journal'
  else git -C "$clone" --no-pager diff --stat "$base" "$branch" -- . ':(exclude)journal'; fi
fi
echo; echo "Log: $run/run.log"
