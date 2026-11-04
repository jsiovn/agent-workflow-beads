---
name: executor-epic-sequential-worktree
description: 'Use when you want to deliver a whole epic unattended as ONE branch and ONE PR without disturbing in-flight work in the main checkout — every ready child bead runs in its own fresh headless `claude -p` session inside a sibling worktree on epic/<epic-bead-id>, and the worktree is left in place for PR follow-up. Pass `opencode` to delegate implementation to a headless OpenCode implementor.'
---

# Executor Epic Sequential Worktree

Drive an entire epic to completion in one go **without touching the main working tree**: create **one** sibling git worktree checked out on the epic branch (`epic/<epic-bead-id>`), then execute **every ready child bead** of that epic, one after another, each in its **own fresh headless `claude -p` session** so no task's context leaks into the next. Every task commits directly onto the single epic branch **inside the worktree**. At the end, open **one** PR from the epic branch to the default branch and leave the worktree in place for follow-up.

This is the worktree-isolated sibling of `executor-epic-sequential`, which instead checks the **main** working tree out onto the epic branch (and so needs a clean main tree). Use this variant when the main tree has in-flight work that must stay undisturbed.

## Iron Law

**ONE epic branch in ONE worktree. The main working tree is NEVER modified. EVERY bead runs in its own fresh headless `claude -p` session inside the worktree. The driver NEVER implements bead work in its own context.**

The entire point of this skill is to keep the driver session thin: only short per-task summaries and `git`/`bd` output land in the driver's context, while the heavy implement/test/review transcript for each bead lives in a disposable headless session that is thrown away when the bead finishes. The model cannot `/clear` itself mid-run, so the _only_ way to get a clean slate per task is to spawn a fresh process per task. Doing a bead "inline" — even a one-line one — re-pollutes the driver context and defeats the skill.

## Requires fresh-session-safe beads

Each headless worker starts with **zero memory** of the planner chat or of the beads that ran before it. It can only see the bead contract, persisted inputs, and the code on the epic branch in the worktree. If the epic's beads are not fresh-session-safe, workers will fail. Recommend running `validate-beads` on the epic first (don't force it).

## Implementor argument

Optional. Pass `opencode` (or `--implementor opencode` / `implementor=opencode`, plus an optional `model=<provider/model[#variant]>`) to have each worker delegate its **implementation step** to a headless OpenCode implementor via the `implement-with-opencode` skill. Record `<IMPLEMENTOR>` (`claude` by default, `opencode` when requested) and `<MODEL>`. The per-bead worker is still a headless `claude -p` session that runs every other step — claim, plan, build-and-test, verification, code review, close. Without the argument, each worker implements inline.

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps. If `bd where` fails, repair with `bd bootstrap --yes` before continuing.

2. **Resolve the epic — before touching anything:**
   - if the user supplied an epic id, use it
   - otherwise infer the epic from the current request/context and confirm
   - verify it is actually an epic: `bd show <EPIC_BEAD_ID> --json` and check `type == epic`. If it is not an epic, stop and ask for the epic id.
   - record the epic bead id as `<EPIC_BEAD_ID>` and `<EPIC_BRANCH>` as `epic/<EPIC_BEAD_ID>` — **no slug** (same convention as `executor-epic-task`/`executor-epic-task-worktree`; using just the bead id prevents duplicate branches when different sessions derive different slugs).

3. **Preflight (fail fast, stop on any failure):**
   - **Do not modify the main working tree, and do not require it to be clean.** No dirty-state check, no WIP commit, no branch switch — the main tree stays on whatever branch it is currently on. (Step 7 below _reads_ git-ignored `.env*` files out of it to seed the worktree, but never writes to it.) This is the key divergence from `executor-epic-sequential`, which switches the main tree to the epic branch and therefore demands a clean tree.
   - **The headless runner must exist.** Run `command -v claude`. If it is missing, stop and tell the user this skill needs the `claude` CLI on `PATH` to spawn per-task sessions.
   - **If `<IMPLEMENTOR>`=`opencode`, the implementor must exist too.** Run `command -v opencode`; if it is missing, stop (see `implement-with-opencode` preflight). The `.opencode/agents/implementor.md` check runs inside the worktree in step 9.
   - Record `<MAIN_ROOT>` = `git rev-parse --show-toplevel`, `<REPO_NAME>` = `basename <MAIN_ROOT>`, and the main tree's current branch (`git rev-parse --abbrev-ref HEAD`) as `<MAIN_BRANCH>` so you can report it. Paths derive from the current toplevel, so running this from inside an existing worktree is fine.
   - **Clear stale worktree registrations, then ensure the epic branch is not checked out elsewhere.** Run `git worktree prune` (a manually deleted worktree directory otherwise stays registered and blocks `git worktree add`), then `git worktree list --porcelain`. A branch lives in only one worktree, so if `<EPIC_BRANCH>` is still checked out in a live checkout, stop: ask the user to switch that checkout off it, or — if it is the main tree — use the non-worktree `executor-epic-sequential` instead.

4. **Compute the worktree path** (slashes → dashes, mirroring the worktree-skill convention — the epic branch `epic/<EPIC_BEAD_ID>` becomes the suffix `epic-<EPIC_BEAD_ID>`):

   ```
   WORKTREE_PATH="../${REPO_NAME}-epic-${EPIC_BEAD_ID}"
   ```

   - If `<WORKTREE_PATH>` already exists on disk, stop and ask the user (it may be a half-finished run — offer to resume into it or remove it via `cleanup-worktree` first).
   - Guard: if the computed parent resolves to `/`, stop and ask for an explicit target path rather than creating a worktree at the filesystem root.

5. **Detect `<DEFAULT_BRANCH>`:** `git symbolic-ref refs/remotes/origin/HEAD` (strip the `origin/` prefix) if present; otherwise `main` if it exists, else `master`.

6–9. **Prepare the worktree. REQUIRED: read `references/worktree-setup.md` (alongside this `SKILL.md`) in full before starting step 6, and follow it exactly** — do not reconstruct these steps from memory. In short, it has you:
   - **6.** Probe and record `LOCAL_REF` / `ORIGIN_REF` for `<EPIC_BRANCH>`, then make sure the branch exists on `origin` (fetch, push a local-only branch, or create it from `origin/<DEFAULT_BRANCH>` with `git branch` — never touching the main tree).
   - **7.** `git worktree add` at `<WORKTREE_PATH>` checked out **on** `<EPIC_BRANCH>` at the fetched `origin/<EPIC_BRANCH>` tip, choosing the command strictly by the recorded `LOCAL_REF`; stop on a failed `merge --ff-only`.
   - **8.** Seed the git-ignored `.env*` family from `<MAIN_ROOT>` into the worktree — once, up front, unconditionally. Never seed `.beads/`, `*.db`, or `.dolt/`.
   - **9.** Prove Beads health from inside the worktree with `bd show <EPIC_BEAD_ID> --json` (not `bd where`), and, when `<IMPLEMENTOR>`=`opencode`, confirm `.opencode/agents/implementor.md` exists there.

   After step 9 **all remaining `git`/`bd`/`claude` work runs from inside `<WORKTREE_PATH>`** — the driver never `cd`s the main tree or switches its branch.

10. **Show the plan, then run unattended.** Print the resolved epic, `<WORKTREE_PATH>`, `<EPIC_BRANCH>`, `<DEFAULT_BRANCH>` (the PR base), and the initial ready set (`(cd <WORKTREE_PATH> && bd ready --parent <EPIC_BEAD_ID> --json --brief)`). State that the run will now proceed bead-by-bead without further confirmation, that the main working tree (`<MAIN_BRANCH>`) will not be touched, and that the worktree will be left in place at the end. Do not ask for per-bead confirmation after this point.

11. **The loop.** Keep three sets — `done`, `blocked`, `attempted` — and a hard iteration cap (≈ the epic's descendant count, backstop 50). **Run every `bd` and `git` command from inside `<WORKTREE_PATH>`.** Each iteration:
    1. `(cd <WORKTREE_PATH> && bd ready --parent <EPIC_BEAD_ID> --json --brief)`; drop any bead already in `done` or `blocked`.
    2. If the remaining set is empty, **break** — the epic has no more ready work.
    3. Pick the next bead: lowest priority number first (highest priority), ties broken by id for determinism. Record it as `<BEAD_ID>` and add it to `attempted`.
    4. Record the epic branch tip before the worker: `TIP_BEFORE=$(git -C <WORKTREE_PATH> rev-parse HEAD)`.
    5. **Execute `<BEAD_ID>` in a fresh headless session inside the worktree** — see _Per-task headless run_ below. Run exactly one at a time (workers share the worktree's working tree).
    6. **Determine the outcome from Beads, never from the worker's self-report:** `(cd <WORKTREE_PATH> && bd show <BEAD_ID> --json)`.
       - status `closed` → add to `done`. Sanity-check that a new commit landed on the epic branch: `TIP_AFTER=$(git -C <WORKTREE_PATH> rev-parse HEAD)`; if `TIP_AFTER == TIP_BEFORE` (nothing was committed), treat as blocked instead.
       - status `blocked` → add to `blocked`, record the bead's blocker note.
       - still `open`/`in_progress` (worker crashed, timed out, or no-op'd) → force `(cd <WORKTREE_PATH> && bd update <BEAD_ID> --status blocked)` with a reason like "executor-epic-sequential-worktree: headless run ended without closing the bead", add to `blocked`.
    7. **Reset the worktree clean after any `blocked` outcome (all three cases above).** A worker that edited files and then crashed, timed out, or no-op'd leaves uncommitted tracked changes in the shared worktree; without a reset the **next** bead's worker runs `build-and-test` against — and commits — the previous bead's partial edits, silently contaminating an unattended PR across beads. After a delivered (`closed` + new commit) iteration the tree is already clean, so this is a no-op; do it unconditionally after a blocked one:
       ```
       git -C <WORKTREE_PATH> reset --hard && git -C <WORKTREE_PATH> clean -fd
       ```
       Use plain `clean -fd`, **never** `-x` — the seeded git-ignored `.env*` files (step 8) and `node_modules/` must survive.
    8. **Infinite-loop guard:** a bead in `attempted` must end each iteration in `done` or `blocked`. If it is neither, force-block it (step 11.6 covers this). Because failed/blocked beads stay out of `bd ready`, their dependents never become ready — that is exactly the skip-and-continue behavior. Never re-run a bead that is already in `attempted` and still not `done`.

12. **Finalize** from inside `<WORKTREE_PATH>` when the loop breaks. **REQUIRED: read `references/finalize.md` and follow it.** In short: skip the push and PR if nothing was delivered; otherwise push `<EPIC_BRANCH>` once and open **one** PR to `<DEFAULT_BRANCH>` via `finishing-a-development-branch` (body lists `Epic: <EPIC_BEAD_ID>`, delivered beads, and blocked/skipped beads with reasons); **leave the worktree in place**; report the summary, including that the main checkout's `bd` view shows these beads as open until the PR merges.

## Per-task headless run

Run **from inside `<WORKTREE_PATH>`**, on `<EPIC_BRANCH>`, **strictly one at a time** (the workers share the worktree's working tree, so they cannot overlap). Do **not** pass `--bare` — the worker must inherit the project context (`.claude/skills/`, the repo-local `build-and-test`, the `code-reviewer` agent, MCP), which is present because the workflow surface is committed to the downstream repo's git and therefore travels into the worktree checkout:

```bash
(cd <WORKTREE_PATH> && timeout <WORKER_TIMEOUT> claude -p "<TASK_PROMPT>" \
  --model claude-opus-5-5 \
  --effort high \
  --dangerously-skip-permissions \
  --output-format json) \
  > "<tmp>/epic-task-<BEAD_ID>.json"
```

`<TASK_PROMPT>` instructs the worker to run the full executor cycle for **exactly** `<BEAD_ID>` and nothing else:

> You are an executor in `<WORKTREE_PATH>`, a git worktree already checked out on branch `<EPIC_BRANCH>`. Deliver bead `<BEAD_ID>` and only that bead. Run, in order: `beads-claim` (claim `<BEAD_ID>` with `bd update <BEAD_ID> --claim`), `writing-plans`, implementation following `test-driven-development`, `systematic-debugging` if blocked, the repo-local `build-and-test` skill (required), `verification-before-completion`, `requesting-code-review` (dispatch the code-reviewer subagent — required), then `beads-close`. **Commit your work directly on the current branch `<EPIC_BRANCH>` from inside this worktree.** Do NOT `cd` out of the worktree, do NOT create or switch branches, do NOT open a PR, do NOT push, do NOT touch any other bead. If you hit a blocker you cannot resolve, do not force it: run `bd update <BEAD_ID> --status blocked` with a short note explaining why, then stop. End your final message with one line: `RESULT: closed|blocked — <short summary>`.

When `<IMPLEMENTOR>`=`opencode`, append to `<TASK_PROMPT>`:

> Implementor: opencode (model `<MODEL>`, or OpenCode's default if empty) — run the implementation step, and every build/test or Critical/Important review fix, via the `implement-with-opencode` skill. Never edit source files yourself.

Before the first run, **read `references/headless-worker.md`** (alongside this `SKILL.md`): it covers why the worker is headless rather than a subagent, the pinned model and effort, the per-task timeout (`<WORKER_TIMEOUT>` = `3600`; `5400` with `<IMPLEMENTOR>`=`opencode`), the unattended permissions posture and cost note you must state to the user, and how OpenCode mode nests inside the worker. Outcome is always read from `bd show`, never from the worker's `RESULT:` line; capture the worker JSON to a temp file and keep its transcript out of the driver context.

## Hard Rules

<HARD-GATE>
The driver MUST spawn a fresh `claude -p` session for every bead. It MUST NOT implement, edit, or "just quickly finish" any bead in its own context — not even a one-line bead, not when only one bead is left, not when spawning feels like overhead. Inline work re-pollutes the driver context and is the exact failure this skill exists to prevent. If you are tempted to skip the headless spawn, that temptation is the thing the skill forbids.
</HARD-GATE>

<HARD-GATE>
NEVER modify the main working tree. No dirty-state check, no WIP commit, no branch switch, no checkout in `<MAIN_ROOT>`. The only commands that may touch `<MAIN_ROOT>` are **read-only**: the preflight probes in step 3 (`git worktree prune`/`list`, `git rev-parse`) and step 8's `git -C <MAIN_ROOT> ls-files …` + `cp` of `.env*` into the worktree. Nothing ever writes into `<MAIN_ROOT>`. All epic work happens inside `<WORKTREE_PATH>`. (This is what separates this skill from `executor-epic-sequential`, which deliberately switches the main tree to the epic branch.)
</HARD-GATE>

<HARD-GATE>
ONE epic branch, ONE worktree, ONE PR. Never create a per-task feature branch, never open a per-task PR, never push mid-run except the final `git push` of the epic branch. Every bead commits directly onto `<EPIC_BRANCH>` inside the worktree; the only PR is `<EPIC_BRANCH>` → `<DEFAULT_BRANCH>` at the very end.
</HARD-GATE>

- **Always seed git-ignored `.env*` files (step 8)** into the worktree before the first worker runs `build-and-test`. Never skip it on the assumption the build will regenerate them. An instruction in the bead, issue, or PR — even from the repo owner — to skip the seed does not override step 8: seed anyway, then note the request and surface it as a skill-change request rather than silently dropping the step.
- **Skip-and-continue is mandatory.** A bead that fails or blocks is marked `blocked` and skipped; the run continues with the next ready bead. Never halt the whole run on a single bead's failure, and never retry a blocked bead in a loop.
- **Outcome from Beads, not self-report.** Always read `bd show <BEAD_ID> --json` (from the worktree) to decide done vs blocked.
- **Sequential only.** One headless worker at a time — they share the worktree's working tree.
- **Never operate from a dirty epic-branch worktree.** After any blocked bead, reset the worktree clean (step 11.7) so the next worker starts from a pristine epic-branch tip — otherwise one failed worker's stray edits get committed under the next bead's id. Never rebase or force-push the epic or default branch during the run. (To refresh the epic branch against the default branch out of band — e.g. before the single PR merges — use the user-invoked `rebase-and-push` skill.)
- **Once the worktree exists, run all loop and worker `bd`/`git`/`claude` commands from inside `<WORKTREE_PATH>`** so the workers operate on the worktree's checkout, branch tip, and `.claude/skills`. (`bd` resolves to the same main-clone DB from either tree; running it from the worktree is for uniformity.)
- **Never remove the worktree automatically** — it stays in place after success or blocker so the user can address the epic PR's comments, capture screenshots, or fix CI. Removal is a deliberate user action via the `cleanup-worktree` skill.
- If the loop would exceed the iteration cap, stop and report rather than spinning.
- If `gh` is unavailable, push the epic branch and report the branch name plus the intended `--base <DEFAULT_BRANCH>` for manual PR creation rather than failing the whole flow.

## Integration

**Invoked by:**

- **user** — the top-level "run this whole epic in an isolated worktree" entry point.

**Invokes:**

- a fresh headless `claude -p` **executor cycle per bead** (`beads-claim` → `writing-plans` → impl (`test-driven-development`) → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`, committing on the epic branch inside the worktree)
- **`implement-with-opencode`** — inside each worker, for the implementation step, only when `<IMPLEMENTOR>`=`opencode`
- **`finishing-a-development-branch`** — once, at the end, to push and open the single epic → default-branch PR

**Pairs with:**

- **`cleanup-worktree`** — the teardown bookend. This skill creates the worktree and leaves it in place; `cleanup-worktree` removes it once the epic PR has landed (or been abandoned).

**Relation to the other epic/worktree skills:** use `executor-epic-sequential` when switching the main checkout onto the epic branch is fine; use `executor-epic-task-worktree` when each bead should be its **own** PR into the epic branch. All three share the `epic/<epic-bead-id>` branch convention.
