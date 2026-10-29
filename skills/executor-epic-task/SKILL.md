---
name: executor-epic-task
description: 'Run a full executor cycle for one bead on a fresh feature branch off its parent epic branch (epic/<epic-bead-id>): stash any in-flight work, switch to the epic branch, pull, create feat/<bead-id>-<short-slug>, execute the bead end-to-end, then push and open a PR targeting the epic branch. Use when the user wants a single bead delivered as its own PR into an in-progress epic branch instead of main. Pass `opencode` to delegate implementation to a headless OpenCode implementor.'
---

# Executor Epic Task

Run exactly one full executor cycle for one bead, isolated on a fresh feature branch cut from the latest epic branch (`epic/<epic-bead-id>`), and deliver it as a PR that targets that epic branch.

This is the preferred manual path when an epic has its own long-lived integration branch (so the epic can land in main as one merge) and each child bead should ship as its own PR into that epic branch.

## Implementor argument

Optional. Pass `opencode` (or `--implementor opencode` / `implementor=opencode`, plus an optional `model=<provider/model[#variant]>`) to delegate the **implementation step** to a headless OpenCode implementor via the `implement-with-opencode` skill. Record `<IMPLEMENTOR>` (`claude` by default, `opencode` when requested) and `<MODEL>`. Claude still runs every other step — claim, plan, build-and-test, verification, code review, close. Without the argument, Claude implements inline.

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps.
   - If `<IMPLEMENTOR>`=`opencode`, run the `implement-with-opencode` preflight now, before touching the working tree; stop if it fails.

2. Determine the target bead **before touching the working tree**:
   - if the user supplied a bead id in the current request, use that bead
   - if the user supplied freeform selector text, treat it as a selector or hint
   - otherwise inspect `bd ready --json` and choose the best ready bead autonomously
   - preference order: a ready bead clearly related to the current repo context or recent planner discussion, else the highest-priority ready bead
   - if the choice is ambiguous, ask before claiming
   - record the chosen bead id as `<BEAD_ID>` (e.g. `lexify-wyk`) for the rest of the flow

3. Determine the **parent epic bead** for `<BEAD_ID>`:
   - if the user supplied an epic id in the current request, use that epic
   - otherwise inspect the bead's dependencies (`bd show <BEAD_ID> --json` and/or `bd dep list <BEAD_ID>`) and look for a parent dep whose target bead has `--type epic`
   - if multiple epic parents exist, ask the user which one to target
   - if no epic parent exists, stop and tell the user this skill requires the bead to be parented under an epic (or have them pass the epic id explicitly)
   - record the epic bead id as `<EPIC_BEAD_ID>`

4. Record `<EPIC_BRANCH>` as `epic/<EPIC_BEAD_ID>` — no slug. Using just the bead id prevents duplicate branches when different sessions derive different slugs from the same epic title.

5. Derive `<TASK_SLUG>` from the bead title and record `<BRANCH_NAME>` as `feat/<BEAD_ID>-<TASK_SLUG>`:
   - lowercase the title
   - drop file extensions (`.tsx`, `.ts`, `.py`, etc.) and leading punctuation around tokens (`__root.tsx` → `root`)
   - replace any non-alphanumeric run with a single `-`
   - drop English filler words: `the`, `a`, `an`, `and`, `or`, `of`, `to`, `for`, `in`, `on`, `with`, `vs`, `via`, plus low-signal trailing words like `cleanup`, `update`, `changes`, `work`
   - **preserve** task identifier prefixes the title carries (e.g. `t9`, `m3`, `phase2`)
   - keep at most 4–5 meaningful tokens, joined with `-`
   - trim leading/trailing `-`, collapse repeated `-`
   - target ≤ 40 characters for the slug itself; truncate the last token if needed
   - example: bead `lexify-wyk` titled `T9 — __root.tsx wiring + Home/LoggedOut swap + cleanup` → `<TASK_SLUG>` is `t9-root-wiring-swap` and `<BRANCH_NAME>` is `feat/lexify-wyk-t9-root-wiring-swap`
   - if the title is too generic to yield ≥ 2 meaningful tokens (e.g. `Fix bug`), fall back to `<BRANCH_NAME>` = `feat/<BEAD_ID>` and note this in the final summary

6. Resolve the epic branch. Try in this order:
   - `git rev-parse --verify <EPIC_BRANCH>` (local)
   - `git ls-remote --exit-code --heads origin <EPIC_BRANCH>` (remote)
   - record whether the epic branch exists locally, only remotely, or not at all
   - if it exists nowhere, this skill will create it from the latest default branch in step 8. Detect the default branch first: use `git symbolic-ref refs/remotes/origin/HEAD` if present; otherwise fall back to `main` if it exists, else `master`. Record as `<DEFAULT_BRANCH>`. Note in the final summary that the epic branch was created.

7. Preserve any in-flight changes on the current branch:
   - run `git status --porcelain` to detect dirty state (tracked changes, untracked files, staged or unstaged)
   - record the current branch name as `<PREV_BRANCH>` via `git rev-parse --abbrev-ref HEAD`
   - if dirty:
     - if `<PREV_BRANCH>` equals `<EPIC_BRANCH>`, stop and ask the user how to proceed — do not auto-commit on the epic branch
     - otherwise, stage everything and commit on `<PREV_BRANCH>` with message:
       ```
       wip(<PREV_BRANCH>): switching to <BEAD_ID> — <short reason>
       ```
       where `<short reason>` is "start <BEAD_ID>" plus the bead title if known. Use `git add -A` then `git commit -m "..."`.
     - Do **not** use `git stash` — a real WIP commit on the source branch is easier to recover and survives `git checkout`.
   - if clean, no action needed

8. Switch to the epic branch and update it:
   - if it exists locally: `git checkout <EPIC_BRANCH>` then `git pull --ff-only` (only if it has an upstream)
   - if it exists only remotely: `git fetch origin <EPIC_BRANCH>` then `git checkout -b <EPIC_BRANCH> origin/<EPIC_BRANCH>`
   - if it does not exist anywhere: create it from the latest default branch:
     ```
     git fetch origin <DEFAULT_BRANCH>
     git checkout -b <EPIC_BRANCH> origin/<DEFAULT_BRANCH>
     git push -u origin <EPIC_BRANCH>
     ```
   - If `pull --ff-only` fails (local divergence on the epic branch), stop and ask the user — do not force or rebase silently.

9. Create the feature branch off the freshly updated epic branch:

   ```
   git checkout -b <BRANCH_NAME>
   ```

   If `<BRANCH_NAME>` already exists locally, stop and ask the user whether to reuse, rename, or delete it.

10. Run the executor cycle for `<BEAD_ID>` — **every step in order**:
    - `beads-claim`
    - `writing-plans`
    - implementation — Claude inline (default), or `implement-with-opencode` when `<IMPLEMENTOR>`=`opencode`
    - `systematic-debugging` if blocked
    - **`build-and-test`** — REQUIRED after implementation. Read the repo-local skill (`.claude/skills/build-and-test/SKILL.md`) and follow it. Do NOT skip this step.
    - `verification-before-completion` (run the verification commands)
    - `requesting-code-review` (dispatch the code-reviewer subagent; required, not optional)
    - `beads-close`

11. If separate work is discovered, create follow-up beads during execution or before close. Keep this branch scoped to `<BEAD_ID>` only.

12. If a blocker appears, update the current bead, summarize the blocker, and stop **on the feature branch** — do not push or open a PR. The earlier WIP commit on `<PREV_BRANCH>` is intact and can be returned to with `git checkout <PREV_BRANCH>`.

13. If build/test fails and the fix is still in scope, return to implementation and retry. When `<IMPLEMENTOR>`=`opencode`, every retry — build/test failures and Critical/Important code-review findings alike — is a new implementor fix round (`implement-with-opencode`, ≤3 rounds); Claude never patches source itself.

14. After successful close, finalize the branch by following the **`finishing-a-development-branch`** skill:
    - verify clean tree and commits ahead of `<EPIC_BRANCH>` (not main)
    - `git push -u origin HEAD`
    - `gh pr create --base <EPIC_BRANCH> --title "<conventional-commit title>" --body "..."` — the PR body must include both an `Epic: <EPIC_BEAD_ID>` line and a `Bead: <BEAD_ID>` reference line (e.g. `Bead: lexify-a8m`). The title follows conventional commits format (`type(scope): description`) with no bead id prefix.
    - report the PR URL

15. Stop with a concise summary: bead id, epic id, `<EPIC_BRANCH>` (PR base), `<BRANCH_NAME>`, PR URL, and a one-line note if a WIP commit was left on `<PREV_BRANCH>` so the user knows where to return.

## Checkout Discipline

- If `bd where` fails in the current checkout, stop and repair the repo with `bd bootstrap --yes` before continuing.
- Never rebase or force-push the epic branch or the default branch during the run. (To refresh the epic branch against the default branch out of band, the user can run the `rebase-and-push` skill on it once its open child PRs are merged.)
- If the epic branch does not exist locally or on origin, create it from the latest default branch and push it before cutting the feature branch off it.
- The feature branch must be named `feat/<BEAD_ID>-<TASK_SLUG>` so it is unambiguously tied to the bead and human-readable. Fall back to `feat/<BEAD_ID>` only when the title yields fewer than 2 meaningful tokens.

## Hard Rules

- One bead, one branch, one PR — and the PR targets the epic branch, not the default branch.
- Never lose uncommitted work — always make a WIP commit on the previous branch before switching, never stash silently, and never operate from a dirty epic branch.
- Do not silently skip verification or code review.
- Do not continue into another bead after the PR is opened.
- If `gh` is unavailable, push the branch and report the branch name plus the intended `--base <EPIC_BRANCH>` for manual PR creation rather than failing the whole flow.
- **No pausing between sub-skill invocations.** After each sub-skill (`beads-claim`, `writing-plans`, `build-and-test`, `verification-before-completion`, `requesting-code-review`, `beads-close`) completes, invoke the next one immediately without asking the user for confirmation. Only stop mid-flow for a genuine blocker (build failure, merge conflict, ambiguous bead choice).
