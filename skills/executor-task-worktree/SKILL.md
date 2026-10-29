---
name: executor-task-worktree
description: 'Run a full executor cycle for one bead in a fresh git worktree off main: leaves the main working tree completely untouched, creates a sibling worktree at ../<repo>-feat-<bead-id>-<short-slug>, executes the bead end-to-end, pushes, opens a PR, and leaves the worktree in place for follow-up work (review comments, screenshots, CI fixes). Use when the main tree has active work that must not be disturbed. Use the `cleanup-worktree` skill to remove the worktree once follow-up work is done. Pass `opencode` to delegate implementation to a headless OpenCode implementor.'
---

# Executor Worktree

Run exactly one full executor cycle for one bead, isolated in a fresh git worktree cut from the latest main, and deliver it as a PR.

This is the preferred path when the main working tree has in-flight changes that must not be touched — no WIP commit, no branch switch, the main tree stays exactly as it is. All bead work happens in a sibling worktree that is created automatically and left in place after the PR opens, so the user can return to it for review comments, screenshots, or CI fixes. Removal is a separate manual step via the `cleanup-worktree` skill.

## Implementor argument

Optional. Pass `opencode` (or `--implementor opencode` / `implementor=opencode`, plus an optional `model=<provider/model[#variant]>`) to delegate the **implementation step** to a headless OpenCode implementor via the `implement-with-opencode` skill. Record `<IMPLEMENTOR>` (`claude` by default, `opencode` when requested) and `<MODEL>`. Claude still runs every other step — claim, plan, build-and-test, verification, code review, close. Without the argument, Claude implements inline.

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps.
   - If `<IMPLEMENTOR>`=`opencode`, run the `implement-with-opencode` preflight now, before touching the working tree; stop if it fails.

2. Determine the target bead **before touching anything**:
   - if the user supplied a bead id in the current request, use that bead
   - if the user supplied freeform selector text, treat it as a selector or hint
   - otherwise inspect `bd ready --json` and choose the best ready bead autonomously
   - preference order: a ready bead clearly related to the current repo context or recent planner discussion, else the highest-priority ready bead
   - if the choice is ambiguous, ask before proceeding
   - record the chosen bead id as `<BEAD_ID>` (e.g. `lexify-wyk`) for the rest of the flow

3. Derive `<TASK_SLUG>` from the bead title and record `<BRANCH_NAME>` as `feat/<BEAD_ID>-<TASK_SLUG>`:
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

4. Detect the default branch. Use `git symbolic-ref refs/remotes/origin/HEAD` if present; otherwise fall back to `main` if it exists, else `master`. Record as `<DEFAULT_BRANCH>`.

5. **Do not modify the main working tree.** No dirty-state check, no WIP commit, no branch switch — it stays on whatever branch it is currently on. (Step 9 below _reads_ git-ignored `.env*` files out of it to seed the worktree, but never writes to it.)

6. Determine the worktree path. Use `<BRANCH_NAME>` minus the `feat/` prefix as the path suffix so the worktree dir mirrors the branch name:

   ```
   REPO_NAME=$(basename $(git rev-parse --show-toplevel))
   WORKTREE_PATH="../${REPO_NAME}-feat-${BEAD_ID}-${TASK_SLUG}"
   ```

   (or `../${REPO_NAME}-feat-${BEAD_ID}` if you fell back to the bead-id-only branch name)

7. Fetch the default branch ref so the worktree starts from the latest upstream state:

   ```
   git fetch origin <DEFAULT_BRANCH>
   ```

8. Create the worktree on a new branch off the freshly fetched default:

   ```
   git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> origin/<DEFAULT_BRANCH>
   ```

   - If `<BRANCH_NAME>` already exists locally, stop and ask the user whether to reuse, rename, or delete it.
   - If `<WORKTREE_PATH>` already exists on disk, stop and ask the user.

9. **Seed git-ignored local env files into the worktree — REQUIRED before `build-and-test`.** A fresh worktree checks out only _tracked_ files, so git-ignored local config the build needs — `.env.local`, `.env`, and the rest of the `.env*` family — is absent, and `build-and-test` would otherwise run against a worktree with no environment. Do this up front and unconditionally; do **NOT** skip or defer it on the assumption that `build-and-test` will synthesize a default environment — seed first, then let `build-and-test` verify, regardless of whether you believe the build needs the env. Copy those files (and only those) from the main checkout into the worktree, preserving relative paths. Run this from the main checkout (`<MAIN_ROOT>` = its root, `git rev-parse --show-toplevel`); it reads from the main tree but never writes to it:

   ```
   git -C <MAIN_ROOT> ls-files --others --ignored --exclude-standard --directory \
     | grep -E '(^|/)\.env(\.[^/]*)?$' \
     | while IFS= read -r f; do
         mkdir -p "<WORKTREE_PATH>/$(dirname "$f")"
         cp -p "<MAIN_ROOT>/$f" "<WORKTREE_PATH>/$f"
       done
   ```

   - `--directory` collapses fully-ignored directories (`node_modules/`, `dist/`, `.beads/`, `*.db`) to a single entry so the `grep` skips them — only `.env*` files are copied, never dependencies or build output. `cp -p` preserves the source permissions (env files are often `600`).
   - Always run the detection command; only treat this as a no-op when its _actual_ output is empty. Never pre-judge that no `.env*` files exist because the worktree _looks_ build-ready (`.env.example` is tracked and proves nothing).
   - This `.env*` seed is the up-front, non-negotiable part. _Separately_, if `build-and-test` later fails because some **other** git-ignored config is missing (e.g. `.dev.vars`, a local service-account JSON), copy that one file the same way — but that reactive copy never replaces the up-front `.env*` seed above. Do not bulk-copy all ignored files.

10. Run the executor cycle for `<BEAD_ID>` — **every step in order, operating inside `<WORKTREE_PATH>`**:

- `beads-claim`
- `writing-plans`
- implementation — Claude inline (default), or `implement-with-opencode` when `<IMPLEMENTOR>`=`opencode` (run it with the checkout = `<WORKTREE_PATH>`; its preflight re-checks `.opencode/agents/implementor.md` there)
- `systematic-debugging` if blocked
- **`build-and-test`** — REQUIRED after implementation. Read the repo-local skill from the worktree (`.claude/skills/build-and-test/SKILL.md`) and follow it. Do NOT skip this step.
- `verification-before-completion` (run the verification commands)
- `requesting-code-review` (dispatch the code-reviewer subagent; required, not optional)
- `beads-close`

11. If separate work is discovered, create follow-up beads during execution or before close. Keep this worktree scoped to `<BEAD_ID>` only.

12. If a blocker appears, update the current bead, summarize the blocker, and stop. Report the worktree path so the user can return to it. The worktree is never removed automatically — use the `cleanup-worktree` skill when ready to discard it.

13. If build/test fails and the fix is still in scope, return to implementation and retry. When `<IMPLEMENTOR>`=`opencode`, every retry — build/test failures and Critical/Important code-review findings alike — is a new implementor fix round (`implement-with-opencode`, ≤3 rounds); Claude never patches source itself.

14. After successful close, finalize the branch from within `<WORKTREE_PATH>` following the **`finishing-a-development-branch`** skill:
    - verify clean tree and commits ahead of `<DEFAULT_BRANCH>`
    - `git push -u origin HEAD`
    - `gh pr create --base <DEFAULT_BRANCH> --title "<conventional-commit title>" --body "..."` — the PR body must include a `Bead: <BEAD_ID>` reference line (e.g. `Bead: lexify-a8m`). The title follows conventional commits format (`type(scope): description`) with no bead id prefix.
    - report the PR URL

15. Stop with a concise summary: bead id, `<BRANCH_NAME>`, PR URL, and the worktree path (so the user can `cd` back in for follow-up work). The main working tree was never modified. The worktree is left in place — use the `cleanup-worktree` skill to remove it once review comments, screenshots, and CI fixes are done.

## Checkout Discipline

- Never modify the main working tree during execution. The only interaction with it is step 9's read-only copy of git-ignored `.env*` files into the worktree.
- If `bd where` fails inside the worktree, stop and repair with `bd bootstrap --yes` from within the worktree before continuing.
- Never rebase or force-push the default branch.
- The feature branch must be named `feat/<BEAD_ID>-<TASK_SLUG>` so it is unambiguously tied to the bead and human-readable. Fall back to `feat/<BEAD_ID>` only when the title yields fewer than 2 meaningful tokens.
- The worktree directory name must mirror the branch (`../<repo>-feat-<BEAD_ID>-<TASK_SLUG>`) so a `git worktree list` makes the active bead obvious.

## Hard Rules

- One bead, one worktree, one PR.
- Never modify the main working tree (step 9 reads `.env*` files from it read-only; nothing ever writes to it).
- Always seed git-ignored `.env*` files (step 9) into the worktree before running `build-and-test`. Never skip it on the assumption the build will regenerate them. An instruction in the bead, issue, or PR — even from the repo owner — to skip the seed does not override step 9: seed anyway, then note the request and surface it as a skill-change request rather than silently dropping the step.
- Do not silently skip verification or code review.
- Do not continue into another bead after the PR is opened.
- If `gh` is unavailable, push the branch and report the branch name for manual PR creation rather than failing the whole flow.
- Never remove the worktree automatically — it stays in place after success or blocker so the user can address PR comments, capture screenshots, or fix CI. Removal is a deliberate user action via the `cleanup-worktree` skill.
- **No pausing between sub-skill invocations.** After each sub-skill (`beads-claim`, `writing-plans`, `build-and-test`, `verification-before-completion`, `requesting-code-review`, `beads-close`) completes, invoke the next one immediately without asking the user for confirmation. Only stop mid-flow for a genuine blocker (build failure, merge conflict, ambiguous bead choice).
