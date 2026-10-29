---
name: executor-rework-in-place
description: 'Re-execute one bead on the current feature branch in the current main worktree, after its requirements were updated and its PR is already open. Requires bead_id. Does NOT create a branch, switch to main, or open a new PR — just re-claims, re-plans, re-implements, verifies, re-reviews, closes the bead, then pushes into the existing PR with a fixup summary comment. Pass `opencode` to delegate implementation to a headless OpenCode implementor.'
---

# Executor Rework In Place

Re-execute exactly one bead on the **current feature branch** in the **current working tree**, after the bead was reopened with corrected requirements. The bead's existing PR is updated in place — no branch is created, no main checkout happens, no new PR is opened.

Use this when:

- A bead was already executed and a PR was opened.
- The task turned out to be wrong (mis-scoped, wrong approach, reviewer pushback that requires a rewrite, etc.).
- The user has reopened the bead (`bd reopen <id>`) and updated its requirements text.
- The fix should land as additional commits on the **same** branch / **same** PR — not a new one.

If you would otherwise create a fresh branch, use `executor-task` (in-place tree) or `executor-task-worktree` (sibling worktree) instead.

## Implementor argument

Optional. Pass `opencode` (or `--implementor opencode` / `implementor=opencode`, plus an optional `model=<provider/model[#variant]>`) to delegate the **implementation step** to a headless OpenCode implementor via the `implement-with-opencode` skill. Record `<IMPLEMENTOR>` (`claude` by default, `opencode` when requested) and `<MODEL>`. Claude still runs every other step — claim, plan, build-and-test, verification, code review, close. Without the argument, Claude implements inline.

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps.
   - If `<IMPLEMENTOR>`=`opencode`, run the `implement-with-opencode` preflight now, before touching the working tree; stop if it fails.

2. **`bead_id` is required.** Read it from the user's invocation. If missing, stop and ask the user for one — do **not** fall back to `bd ready`, do **not** autodetect from the branch name. Reworking the wrong bead is harder to recover from than picking a fresh one wrong. Record as `<BEAD_ID>`.

3. **Sanity-check the current branch.**
   - Record `<CURRENT_BRANCH>` via `git rev-parse --abbrev-ref HEAD`.
   - Detect `<DEFAULT_BRANCH>`. Use `git symbolic-ref refs/remotes/origin/HEAD` if present; otherwise fall back to `main` if it exists, else `master`.
   - If `<CURRENT_BRANCH>` equals `<DEFAULT_BRANCH>`, stop — rework-in-place must run on a feature branch, never on the default branch.
   - If `<CURRENT_BRANCH>` does not contain `<BEAD_ID>` (case-insensitive substring), warn the user with both names and ask whether to proceed. (The substring check is forgiving: branches that fell back to `feat/<BEAD_ID>` with no slug still match.)

4. **Confirm the PR exists and is open.** Run:

   ```bash
   gh pr view --json number,url,state,headRefName -q '{n:.number,url,state,branch:.headRefName}'
   ```

   - If no PR is associated with `<CURRENT_BRANCH>`, stop and tell the user to use `executor-task` instead — this skill is for amending an existing PR.
   - If `state != OPEN`, stop and ask the user (closed/merged PR means rework-in-place is the wrong tool).
   - Record `<PR_NUMBER>` and `<PR_URL>`.

5. **Working tree must be clean.** Run `git status --porcelain`. If non-empty, stop and ask the user how to proceed — do **not** auto-commit, do **not** stash. The user explicitly invoked rework-in-place; a dirty tree is unexpected.

6. **Refresh the branch from origin** so the rework lands on top of any commits already pushed to the PR:

   ```bash
   git fetch origin <CURRENT_BRANCH>
   git merge --ff-only origin/<CURRENT_BRANCH>
   ```

   If `--ff-only` fails (local has commits the remote does not, or histories diverged), stop and ask. Do not auto-rebase, do not force-update.

7. Run the executor cycle for `<BEAD_ID>` — **every step in order**:
   - `beads-claim` — re-claim the reopened bead. If `bd` reports the bead is not in a claimable state (already closed, blocked, owned by someone else, etc.), stop and surface the state to the user.
   - `writing-plans` — REQUIRED. The bead's requirements changed; the existing plan is presumed stale. When invoking writing-plans, explicitly note "the bead was reworked; regenerate or amend the existing plan against the updated bead text" so an existing plan file is overwritten or amended rather than blindly reused.
   - implementation — Claude inline (default), or `implement-with-opencode` when `<IMPLEMENTOR>`=`opencode`
   - `systematic-debugging` if blocked
   - **`build-and-test`** — REQUIRED after implementation. Read the repo-local skill (`.claude/skills/build-and-test/SKILL.md`) and follow it. Do NOT skip this step.
   - `verification-before-completion` (run the verification commands)
   - `requesting-code-review` — REQUIRED. The PR is already open, but the rework introduces new code that needs a fresh local review pass before pushing.
   - `beads-close`

8. If separate work is discovered, create follow-up beads during execution or before close. Keep this branch scoped to `<BEAD_ID>` only.

9. If a blocker appears, update the current bead, summarize the blocker, and stop on the current branch — do not push, do not comment on the PR. The working tree is already where the user wants it; nothing to recover.

10. If build/test fails and the fix is still in scope, return to implementation and retry. When `<IMPLEMENTOR>`=`opencode`, every retry — build/test failures and Critical/Important code-review findings alike — is a new implementor fix round (`implement-with-opencode`, ≤3 rounds); Claude never patches source itself.

11. **Push into the existing PR.** After successful close, follow the `finishing-a-development-branch` skill's pre-push checks (clean tree, commits ahead of `<DEFAULT_BRANCH>`), then:

    ```bash
    git push
    ```

    No `-u` — the branch is already tracking. **Never force-push.** If push fails because the remote moved (someone else pushed), stop and ask the user.

12. **Post a fixup summary comment on the PR.** Identify the repo:

    ```bash
    gh repo view --json owner,name -q '{owner:.owner.login,name:.name}'
    ```

    Then post a top-level comment summarizing the rework:

    ```bash
    SHORT_SHA=$(git rev-parse --short HEAD)
    gh api -X POST "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" -f body="$BODY"
    ```

    The body must:
    - Name the bead id (`Bead: <BEAD_ID>`).
    - State this is a **rework** of the previously reviewed work, with one sentence on why (the bead was reopened with updated requirements).
    - List the high-level diffs since the previous review as a short bullet list (e.g. "regenerated plan against updated bead requirements", "refactored X", "added test Y", "removed Z").
    - End with the new tip SHA so reviewers can anchor their re-review: `New tip: <SHORT_SHA>`.

13. **Web screenshots** — if the bead touched any UI component or page, run the `attach-web-screenshots` skill against the now-updated PR. Skip only when the change is purely non-visual (utility functions, API handlers, types, tests).

14. Stop with a concise summary: bead id, `<CURRENT_BRANCH>`, `<PR_URL>`, new short SHA, and a one-line note that this was a rework (not a fresh PR).

## Checkout Discipline

- Never run this skill on `<DEFAULT_BRANCH>`.
- Never create a new branch. Never check out a different branch. Never create a worktree.
- Never rebase the feature branch from this skill — the PR has reviewers anchored to commit history; new commits only.
- If `bd where` fails in the current checkout, stop and repair the repo with `bd bootstrap --yes` before continuing.

## Hard Rules

- One bead, one **existing** branch, one **existing** PR. Never open a new PR from this skill.
- `bead_id` is required; do not autodetect, do not pick from `bd ready`.
- Never force-push, never rebase, never amend pushed commits — reviewers need linear history to trust the rework.
- Do not silently skip verification or code review.
- Do not continue into another bead after the rework is pushed.
- If `gh` is unavailable, push the branch and report `<CURRENT_BRANCH>` + `<PR_NUMBER>` for manual comment posting rather than failing the whole flow.
- **No pausing between sub-skill invocations.** After each sub-skill (`beads-claim`, `writing-plans`, `build-and-test`, `verification-before-completion`, `requesting-code-review`, `beads-close`) completes, invoke the next one immediately without asking the user for confirmation. Only stop mid-flow for a genuine blocker (build failure, merge conflict, ambiguous bead state).
