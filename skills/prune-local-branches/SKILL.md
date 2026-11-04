---
name: prune-local-branches
description: 'Delete local git branches whose upstream was removed from origin, and tear down any sibling git worktree still attached to them. Use when the user asks to clean up stale, pruned, merged, or deleted remote branches locally — including the worktrees the executor-*-worktree / create-new-worktree flows leave behind.'
---

# Prune Local Branches

Remove local branches whose remote-tracking upstream is gone — the PR merged and origin deleted the branch — and tear down any sibling worktree still attached to them. A branch that is checked out in a worktree **cannot** be deleted (`git branch -D` refuses it: `cannot delete branch '<n>' used by worktree at '<path>'`), so this skill removes the worktree **first**, then deletes the branch.

This is the **bulk** counterpart to `cleanup-worktree` (which removes one worktree at a time and is PR-state-aware). See [Integration with cleanup-worktree](#integration-with-cleanup-worktree) — the two share one safety seam and must stay aligned.

## Steps

### 0. Refuse to run in a bare repository

```bash
git rev-parse --is-bare-repository    # must print "false"
```

If this prints `true`, stop and tell the user to run from a normal checkout. A bare repo has no working tree, no current-worktree to protect, and the detection below does not apply.

### 1. Fetch and prune remote-tracking refs

```bash
git fetch --prune
```

Updates remote-tracking refs and drops any that no longer exist on origin — this is what makes a branch's upstream show up as gone.

### 2. Prune stale worktree admin entries

```bash
git worktree prune
```

Drops the registration for any worktree whose directory was already deleted by hand. This **must** run before any branch deletion: while a stale admin entry survives, `git branch -D` still refuses the branch with `used by worktree`. (`git worktree prune` only touches already-missing directories — it never deletes a live or locked worktree.)

### 3. Find branches with a gone upstream — and their worktrees — via plumbing

**Do not** use `git branch -vv | grep ': gone]'`. That grep false-matches a branch whose upstream is *live* but whose commit subject merely contains the text `[upstream: gone]`, and the `* `/`+ ` prefixes on the current/worktree-checked-out rows shift the fields. Read the tracking field directly instead:

```bash
git for-each-ref \
  --format='%(refname:short)%09%(upstream:track)%09%(worktreepath)%09%(objectname:short)%09%(contents:subject)' \
  refs/heads
```

Keep only rows whose **second** (TAB-separated) field is exactly `[gone]`. The TAB-separated fields are: `branch <TAB> track <TAB> worktreepath (may be empty) <TAB> tipSHA <TAB> subject`. Refnames cannot contain TAB or spaces, so this parse is robust, and `%(worktreepath)` gives you the attached worktree path in the same pass — no separate branch→path lookup needed.

A quick gone-only filter — let git do the matching, so no pipe stage (which an output-condensing hook such as rtk may rewrite) and no `awk` field reference (which Claude Code would replace with the skill's arguments) is involved:

```bash
git for-each-ref \
  --format='%(if:equals=[gone])%(upstream:track)%(then)%(refname:short)%09%(worktreepath)%(end)' \
  refs/heads
```

Non-empty lines are the gone branches (`branch <TAB> worktreepath`); ignore blank lines, which are the branches with a live or no upstream.

If no rows remain, report **"No stale local branches found"** and stop.

### 4. Identify the worktrees you must never remove

```bash
git rev-parse --show-toplevel    # the current worktree's root
git worktree list --porcelain    # first block = the main working tree; `locked` lines mark locked worktrees
```

- The **first** block of `git worktree list --porcelain` is always the **main working tree** — never a removal target.
- The worktree whose root equals `git rev-parse --show-toplevel` is the **current** one — never a removal target (skip it and continue; do not abort the whole sweep).
- **Canonicalize before comparing.** Resolve each candidate worktree path *and* the main/current paths through `realpath` (or `git -C <path> rev-parse --show-toplevel`) and compare the canonical strings — raw paths differ across symlinks, trailing slashes, and add-time-vs-resolved forms. If a path cannot be canonicalized or the match is uncertain, **refuse** to remove that worktree.

### 5. Classify each gone branch that has a worktree

For every gone branch whose `worktreepath` (from step 3) is non-empty, inspect that worktree from the main repo:

```bash
git -C <path> status --porcelain              # non-empty => DIRTY (uncommitted/untracked real work)
git -C <path> status --porcelain --ignored    # any `!!` row (e.g. .env*, *.db, .beads/) => local-only files removal will delete
```

- **Dirty** = `git status --porcelain` is non-empty (modified, staged, or genuinely-untracked files — real unsaved work; git-ignored build artifacts do not show here).
- **Locked** = the worktree's block in `git worktree list --porcelain` contains a `locked` line.
- **Local-only files** = `!!` rows from `--ignored` — these are deleted by `git worktree remove` even without `--force`, and their loss is unrecoverable because they were never in git. (`.env*` is usually a copy seeded from the main tree, so its loss is harmless; `*.db` / `.beads/interactions.jsonl` may be unique worktree state.)
- If `git -C <path> status` **errors** (permission denied, foreign filesystem, missing dir), treat the worktree as **UNKNOWN** → skip and report. Never read an error as "clean".

### 6. Confirm, then prune each branch

Show the user a table and require explicit approval before deleting anything:

| branch | worktree | dirty | locked | local-only files | tip (sha — subject) |
| ------ | -------- | ----- | ------ | ---------------- | ------------------- |

- The **default-selected** set is branches whose worktree is **clean + unlocked** (or that have no worktree). **Default-skip** every dirty, locked, or status-unknown worktree — route those to `cleanup-worktree` (per-worktree, PR-aware) or have the user handle them, rather than force-removing here.
- The tip `sha — subject` column is the only window into un-landed work (the `@{u}..HEAD` unpushed check is structurally impossible once the upstream is gone). Surface it so the user can spot a branch that carries commits added after its last push.

Then iterate over the **confirmed** branches, `continue`-ing on every skip:

For each confirmed gone branch:

1. If it is the **current branch**, or its worktree is the **current** or **main** worktree → skip (report the reason), continue.
2. If it has a worktree:
   - **clean + unlocked** → `git worktree remove <path>`
   - **dirty / has local-only files**, and only with explicit **per-item** confirmation → `git worktree remove --force <path>`
   - **locked**, and only with explicit **per-item** confirmation → `git worktree unlock <path> && git worktree remove <path>` (a single `--force` does **not** remove a locked worktree — it fails with `use 'remove -f -f' to override or unlock first`)
   - If the removal exits **non-zero**, skip (report) and continue — **do not** fall through to delete the branch.
3. `git branch -D <branch>` — only after the worktree was removed (exit 0) or the branch had no worktree. The tip SHA from step 3 is the recovery handle.

Never treat one "yes, force" as a batch-wide flag — confirm each forced/locked removal by its exact path.

### 7. Report

```bash
git worktree prune
git worktree list
```

List, with no embellishment:

- every branch deleted, each with its **tip SHA** — note it is recoverable via `git branch <name> <sha>` until git's next gc;
- every worktree removed;
- everything skipped, with the reason (dirty, locked, current/main worktree, status-unknown, removal failed).

Describe the deleted branches as **"upstream gone (remote branch deleted on origin — normally merged)"**. Never assert "merged": a deleted remote head is not proof of a merge.

## Hard Rules

- **Detect gone branches only via** `git for-each-ref … %(upstream:track)` matched exactly to `[gone]` — never `git branch -vv | grep ': gone]'`. A commit subject can contain that literal text and false-match a branch with a **live** upstream.
- **Abort in a bare repository** (`git rev-parse --is-bare-repository` is `true`).
- **Never remove the main working tree or the current worktree.** Canonicalize both sides before comparing; the first `git worktree list --porcelain` block is main; refuse removal when the match is uncertain.
- **Remove a branch's worktree before `git branch -D`.** Run `git branch -D` only after the worktree was removed with exit 0, or when the branch has no worktree. On any skip or failed removal, `continue` — never fall through to delete.
- **Default-skip every dirty, locked, or status-unknown worktree.** Remove one only after **per-item** confirmation that names the exact path and shows its `git status --porcelain` — never as a batch-wide `--force`.
- **A single `--force` cannot remove a locked worktree** — `git worktree unlock <path>` first (or `git worktree remove --force --force <path>`), and only with explicit confirmation. Single `--force` is for the dirty/untracked case only.
- **Worktree removal deletes git-ignored local-only files** (`.env*`, `*.db`, `.beads/interactions.jsonl` seeded into executor worktrees) even without `--force` — surface them from `--ignored` and confirm before removing; that loss is unrecoverable.
- **Use `git branch -D`, not `-d`.** `: gone]` branches are post-merge, and squash/rebase merges make `-d` falsely refuse them. Print each deleted branch's tip SHA so the work is recoverable before gc. (Deliberate divergence from `cleanup-worktree` — see below.)
- **Never run a `gh pr list` check here.** An open PR keeps its remote head alive, so the branch never shows `[gone]` and is never a target; gh would be redundant and cannot tell a merged branch from a manually-deleted one.
- **Never delete the remote branch.**

## Integration with cleanup-worktree

`prune-local-branches` (this skill) and `cleanup-worktree` share one safety seam — keep them aligned if either changes.

- **Division of labor.** `cleanup-worktree` = single, PR-aware teardown of **one** in-flight worktree whose upstream may still be live; use it while a branch is under review (it runs `gh pr list` and the `@{u}..HEAD` unpushed-commit gate). `prune-local-branches` = **bulk** sweep of branches already `[gone]` (remote head deleted, normally post-merge) — after-the-fact housekeeping. They never overlap: an open PR keeps its head alive, so such a branch never shows `[gone]`.
- **Shared safety seam.** Never remove the main working tree or the current worktree; default-skip dirty/locked worktrees; never pass `--force` to `git worktree remove` without explicit per-item confirmation; never delete the remote branch. Both rely on "main is the first porcelain block" — parse `git worktree list --porcelain` and mirror that wording.
- **Three deliberate divergences** (documented so the two skills read as one seam, not drift):
  1. **Unconditional `git branch -D`** — `cleanup-worktree` prefers `-d` first because its target may be unmerged; here `[gone]` branches are post-merge and `-d` falsely refuses squash/rebase merges.
  2. **No `@{u}..HEAD` unpushed-commit gate** — structurally impossible: the upstream is already gone, so `@{u}` no longer resolves. The `[gone]` filter excludes never-pushed branches (they have no upstream); the tip-SHA column in the step 6 table is the compensating control for post-push local commits.
  3. **Skip-and-continue on the current worktree** instead of `cleanup-worktree`'s hard refuse-to-run-from-inside — by design, so one bad cwd does not abort a bulk sweep. Report it: "Skipped `<branch>` — its worktree is the current directory; re-run from the main repo to drop it too."
- **Route hard cases over the seam.** Dirty, locked, or open-PR worktrees belong to `cleanup-worktree` (per-worktree, PR-aware) or manual handling — keep this skill to the clean, fully-landed cases. Submodule-bearing or locked-missing-dir worktrees: report as "skipped — handle manually".
