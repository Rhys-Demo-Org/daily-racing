#!/usr/bin/env bash
# Live mode (plans/live-prs.md): pushes a finished night's daily/<date> branch and opens its PR. Runs
# on the host after every container has exited, so the builder never sees the GitHub token.
#
#   harness/scripts/publish.sh <run-dir>      ($DAILY_HOME/runs/<date>; daily.sh --live calls it)
#
# What goes to GitHub is one squashed commit on the run's main SHA, so the checks below see exactly
# what is pushed (no intermediate attempt commits). Pushes nothing when the night left no work
# outside the journal. Refuses (exit 1) when the diff breaks G8's allowlist rules or holds a token or
# a secret-shaped string. Pass → ready PR labelled daily + backlog:Bxx; else a draft also labelled failed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/../lib/common.sh"
[[ $# == 1 && -f $1/meta.json && -f $1/result.json ]] || die "usage: publish.sh <run-dir with meta.json and result.json>"
RUN=$1
[[ -n $(tr -d '[:space:]' <"$GITHUB_TOKEN_FILE" 2>/dev/null) ]] || die "no GitHub token at $GITHUB_TOKEN_FILE"
export GITHUB_TOKEN_FILE
refuse() { echo "publish: refused: $*" >&2; exit 1; }

meta() { jq -r "$1" "$RUN/meta.json"; }
DATE=$(meta .date) MAIN_SHA=$(meta .mainSha) ITEM_ID=$(meta '.backlogId // ""')
maint=0; [[ $(meta .ideaType) != maintenance ]] || maint=1
OUTCOME=$(jq -r .outcome "$RUN/result.json")
CLONE=$DAILY_HOME/repo BRANCH=daily/$DATE REPO=$(repo_slug "$DAILY_HOME/repo")
work="$(scratch "$DAILY_HOME/work" publish)"
trap 'rm -rf "$work"' EXIT

git -C "$CLONE" rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null || refuse "no local branch $BRANCH"
if git -C "$CLONE" diff --quiet "$MAIN_SHA" "$BRANCH" -- . ':(exclude)journal'; then
  echo "publish: $OUTCOME night with no work outside the journal; nothing pushed"; exit 0
fi
squash=$(git -C "$CLONE" -c user.name=daily-racer -c user.email=daily-racer@localhost \
  commit-tree "$BRANCH^{tree}" -p "$MAIN_SHA" -m "daily $DATE: $OUTCOME (squashed; per-attempt history in the journal)")

# 1. G8's diff rules (harness/lib/allowlist.ts): paths, modes, binaries, append-only tests.
git -C "$CLONE" diff --raw -z --no-renames "$MAIN_SHA" "$squash" >"$work/raw"
git -C "$CLONE" diff --numstat -z --no-renames "$MAIN_SHA" "$squash" >"$work/numstat"
ts_node allowed "$work/raw" "$work/numstat" "$DATE" "$maint" || refuse "the diff breaks the allowlist rules"

# 2. No token or secret-shaped string (daily.sh already redacts the exact Claude token). grep exits
#    1 for "no match"; anything else (a match, or an error) refuses.
tokens() { local f t; for f in "$TOKEN_FILE" "$GITHUB_TOKEN_FILE"; do t=$(tr -d '[:space:]' <"$f" 2>/dev/null) || true; [[ -z $t ]] || echo "$t"; done; }
tokens >"$work/tokens"
git -C "$CLONE" diff -a "$MAIN_SHA" "$squash" >"$work/patch"
rc=0; grep -qF -f "$work/tokens" "$work/patch" || rc=$?
(( rc == 1 )) || refuse "a token is in the diff (or grep failed: $rc)"
rc=0; grep -qE 'sk-ant-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}' "$work/patch" || rc=$?
(( rc == 1 )) || refuse "a secret-shaped string is in the diff (or grep failed: $rc)"

# 3. Labels and body first, so a failure leaves nothing half-done on GitHub; then push (no force:
#    a branch already on GitHub is never overwritten) and open the PR.
preview="https://$(printf '%s' "$BRANCH" | tr -c 'A-Za-z0-9-' '-' | cut -c1-28).daily-racing.pages.dev" # as deploy.yml names it
title="daily $DATE: $(sed -n '1s/^# //p' "$RUN/spec.md" 2>/dev/null | cut -c1-200 || true)"
labels=(daily) args=()
[[ -z $ITEM_ID ]] || labels+=("backlog:$ITEM_ID")
[[ $OUTCOME == pass ]] || { labels+=(failed); args=(--draft); title="$title [$OUTCOME]"; }
for l in "${labels[@]}"; do gh_ label create "$l" -R "$REPO" --force >/dev/null; args+=(--label "$l"); done
ts_node prbody "$RUN" "$preview" >"$work/body.md"
GIT_ASKPASS="$here/git-askpass.sh" GIT_TERMINAL_PROMPT=0 \
  git -C "$CLONE" -c credential.helper= push -q origin "$squash:refs/heads/$BRANCH"
gh_ pr create -R "$REPO" --base main --head "$BRANCH" --title "$title" --body-file "$work/body.md" "${args[@]}"
