---
name: cleanup-worktree
description: 'Remove a sibling git worktree created by `executor-task-worktree`, `executor-epic-task-worktree`, `executor-epic-sequential-worktree`, or `create-new-worktree` once follow-up work (review comments, screenshots, CI fixes) is done. Lists existing worktrees, confirms which to remove, verifies the branch is safe to drop (PR merged or user-approved), removes the worktree, prunes stale entries, and optionally deletes the local branch.'
---

# Cleanup Worktree

Manually remove one of the sibling worktrees that an `executor-*-worktree` skill created and intentionally left in place. Use this once the PR has merged (or been abandoned) and you no longer need the working directory for review comments, screenshots, or CI fixes.

This skill is **user-invoked only** — the executor skills never call it automatically.

For bulk cleanup of many already-landed branches and their attached worktrees in one pass, use `prune-local-branches` instead — it sweeps every branch whose upstream is `[gone]` (remote head deleted on origin), removing each one's worktree before deleting the branch. This skill is the single, PR-aware teardown for **one** worktree whose upstream may still be live.

## Steps

1. **Never run from inside the worktree you're about to remove.** First, confirm the current working directory:

   ```
   pwd
   git rev-parse --show-toplevel
   ```

   If the current directory is the worktree the user wants removed, instruct them to `cd` into the main repo (or any other directory) first and re-invoke. `git worktree remove` refuses to delete the worktree it is being run from.

2. List all worktrees attached to the current repo so the user can pick one:

   ```
   git worktree list
   ```

   Each row shows path, HEAD, and branch. The main working tree is always listed first — never offer it as a removal target.

3. Determine which worktree to remove:
   - if the user supplied a path, bead id, or branch name in the request, match it against the `git worktree list` output
   - if the user supplied no selector and exactly one removable worktree exists, propose it and ask for confirmation
   - if multiple removable worktrees exist and no selector was given, list them and ask which one
   - record the chosen path as `<WORKTREE_PATH>` and the branch as `<BRANCH_NAME>`

4. **Safety check — verify the work is landed or explicitly disposable.** Run these inside the main repo (not the worktree):

   ```
   git -C <WORKTREE_PATH> status --porcelain
   git -C <WORKTREE_PATH> log --oneline @{u}..HEAD 2>/dev/null
   gh pr list --head <BRANCH_NAME> --state all --json number,state,url 2>/dev/null
   ```

   - if the worktree has uncommitted changes (porcelain output is non-empty), stop and report them; ask the user to commit, stash, or explicitly confirm discard
   - if there are unpushed commits, stop and report them; ask the user to push or explicitly confirm discard
   - if `gh` is available and finds a PR, report its state (MERGED / CLOSED / OPEN). Refuse to remove silently when the PR is still OPEN — ask the user to confirm
   - if `gh` is unavailable or finds no PR, report that and ask the user to confirm

5. Remove the worktree:

   ```
   git worktree remove <WORKTREE_PATH>
   ```

   - if this fails because of leftover local changes the user already accepted, retry with `git worktree remove --force <WORKTREE_PATH>` — but only after explicit user confirmation in this conversation
   - never use `--force` preemptively
   - if it fails because the directory is in use (on Windows: "Permission denied" / "Device or resource busy"), a terminal is probably still open in it: close the Herdr tab whose cwd is the worktree (for example the `<epic-id>-implementer` tab an epic run left open) and retry

6. Prune stale worktree metadata:

   ```
   git worktree prune
   ```

7. Ask whether to delete the local branch `<BRANCH_NAME>`:
   - if the PR was merged or closed, recommend deleting it: `git branch -d <BRANCH_NAME>` (safe — refuses if unmerged)
   - if `git branch -d` refuses because the branch is not merged into its upstream, surface the warning and ask whether to force-delete with `git branch -D <BRANCH_NAME>` — do not force-delete without explicit confirmation
   - never delete the remote branch (`git push origin --delete`) unless the user explicitly asks for it

8. Stop with a concise summary: which worktree was removed, whether the branch was deleted, and a final `git worktree list` so the user can see the remaining worktrees.

## Hard Rules

- One invocation removes one worktree. If the user wants to clean up several, ask them to re-run the skill per worktree (or list them and confirm each in turn).
- Never remove the main working tree.
- Never run `git worktree remove` from inside the worktree being removed.
- Never use `--force` (on `worktree remove` or `branch -D`) without explicit user confirmation captured in this conversation.
- Never delete the remote branch unless explicitly asked.
- If the PR is still open or the work is unpushed, refuse to proceed silently — surface the state and require confirmation.
