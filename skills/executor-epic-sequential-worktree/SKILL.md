---
name: executor-epic-sequential-worktree
description: 'Use when you want to deliver a whole epic unattended as ONE branch and ONE PR WITHOUT disturbing in-flight work in the main checkout. Runs every ready child bead of one epic sequentially in a fresh sibling git worktree checked out on the epic branch (epic/<epic-bead-id>) so the main working tree is never touched — each bead executes in its own fresh headless `claude -p` session (clean context per task), committing directly onto the single epic branch; a failed bead is marked blocked and skipped (along with its dependents) and the run continues; finishes with one PR from the epic branch to the default branch and leaves the worktree in place for follow-up (review comments, CI fixes). Use the `cleanup-worktree` skill to remove the worktree once the PR has landed.'
---

# Executor Epic Sequential Worktree

Drive an entire epic to completion in one go **without touching the main working tree**: create **one** sibling git worktree checked out on the epic branch (`epic/<epic-bead-id>`), then execute **every ready child bead** of that epic, one after another, each in its **own fresh headless `claude -p` session** so no task's context leaks into the next. Every task commits directly onto the single epic branch **inside the worktree**. At the end, open **one** PR from the epic branch to the default branch and leave the worktree in place for follow-up.

This is the worktree-isolated sibling of `executor-epic-sequential`. Both deliver a whole epic unattended as one branch and one PR; the difference is **where** the work happens:

- `executor-epic-sequential` checks the **main working tree** out onto the epic branch (requires a clean main tree, switches branches).
- **this skill** never touches the main working tree — it cuts a sibling worktree at `../<repo>-epic-<epic-bead-id>` and runs the whole epic there, so the main checkout keeps its in-flight work undisturbed.

Use this variant when the main tree has active work that must not be disturbed, or when you want the epic to run in an isolated directory you can `cd` into for the PR's review comments and CI fixes afterward.

## Iron Law

**ONE epic branch in ONE worktree. The main working tree is NEVER modified. EVERY bead runs in its own fresh headless `claude -p` session inside the worktree. The driver NEVER implements bead work in its own context.**

The entire point of this skill is to keep the driver session thin: only short per-task summaries and `git`/`bd` output land in the driver's context, while the heavy implement/test/review transcript for each bead lives in a disposable headless session that is thrown away when the bead finishes. The model cannot `/clear` itself mid-run, so the _only_ way to get a clean slate per task is to spawn a fresh process per task. Doing a bead "inline" — even a one-line one — re-pollutes the driver context and defeats the skill.

## Requires fresh-session-safe beads

Each headless worker starts with **zero memory** of the planner chat or of the beads that ran before it. It can only see the bead contract, persisted inputs, and the code on the epic branch in the worktree. If the epic's beads are not fresh-session-safe, workers will fail. Recommend running `validate-beads` on the epic first (don't force it).

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps. If `bd where` fails, repair with `bd bootstrap --yes` before continuing.

2. **Resolve the epic — before touching anything:**
   - if the user supplied an epic id, use it
   - otherwise infer the epic from the current request/context and confirm
   - verify it is actually an epic: `bd show <EPIC_BEAD_ID> --json` and check `type == epic`. If it is not an epic, stop and ask for the epic id.
   - record the epic bead id as `<EPIC_BEAD_ID>` and `<EPIC_BRANCH>` as `epic/<EPIC_BEAD_ID>` — **no slug** (same convention as `executor-epic-task`/`executor-epic-task-worktree`; using just the bead id prevents duplicate branches when different sessions derive different slugs).

3. **Preflight (fail fast, stop on any failure):**
   - **Do not modify the main working tree, and do not require it to be clean.** No dirty-state check, no WIP commit, no branch switch — the main tree stays on whatever branch it is currently on. (Step 7 below _reads_ git-ignored `.env*` files out of it to seed the worktree, but never writes to it.) This is the key divergence from `executor-epic-sequential`, which switches the main tree to the epic branch and therefore demands a clean tree.
   - **The headless runner must exist.** Run `command -v claude`. If it is missing, stop and tell the user this skill needs the `claude` CLI on `PATH` to spawn per-task sessions. (Under Codex, see _Runtime note_ below.)
   - Record `<MAIN_ROOT>` = `git rev-parse --show-toplevel`, `<REPO_NAME>` = `basename <MAIN_ROOT>`, and the main tree's current branch (`git rev-parse --abbrev-ref HEAD`) as `<MAIN_BRANCH>` so you can report it. Paths derive from the current toplevel, so running this from inside an existing worktree is fine.
   - **Clear stale worktree registrations, then ensure the epic branch is not checked out elsewhere.** First run `git worktree prune` — if a previous run's worktree directory was removed manually (`rm -rf` instead of `cleanup-worktree`/`git worktree remove`), git still registers the branch as checked out at the now-missing path and `git worktree add` would later refuse it with "already used by worktree at &lt;missing path&gt;". Then run `git worktree list --porcelain`. A branch can only be checked out in one worktree at a time, so if `<EPIC_BRANCH>` is *still* checked out (in the main tree or another live worktree), `git worktree add` will refuse. Stop and tell the user: if the conflicting directory no longer exists, `git worktree prune` already cleared it — retry; otherwise either switch that checkout off `<EPIC_BRANCH>`, or — if the epic branch is checked out in the main tree — use the non-worktree `executor-epic-sequential` instead.

4. **Compute the worktree path** (slashes → dashes, mirroring the worktree-skill convention — the epic branch `epic/<EPIC_BEAD_ID>` becomes the suffix `epic-<EPIC_BEAD_ID>`):

   ```
   WORKTREE_PATH="../${REPO_NAME}-epic-${EPIC_BEAD_ID}"
   ```

   - If `<WORKTREE_PATH>` already exists on disk, stop and ask the user (it may be a half-finished run — offer to resume into it or remove it via `cleanup-worktree` first).
   - Guard: if the computed parent resolves to `/`, stop and ask for an explicit target path rather than creating a worktree at the filesystem root.

5. **Detect `<DEFAULT_BRANCH>`:** `git symbolic-ref refs/remotes/origin/HEAD` (strip the `origin/` prefix) if present; otherwise `main` if it exists, else `master`.

6. **Resolve the epic branch and make sure it exists on `origin`** so the worktree can always be cut from the up-to-date `origin/<EPIC_BRANCH>`. Probe and **record both results** (step 7 chooses its worktree-add command from `LOCAL_REF`, so do not skip recording it):
   - `LOCAL_REF` = does `git rev-parse --verify <EPIC_BRANCH>` succeed? (a local branch exists)
   - `ORIGIN_REF` = does `git ls-remote --exit-code --heads origin <EPIC_BRANCH>` succeed? (the branch is on origin)

   Then act on the combination:
   - **on origin (`ORIGIN_REF`=yes):** `git fetch origin <EPIC_BRANCH>` (this covers both "origin only" and "origin + local").
   - **local only (`ORIGIN_REF`=no, `LOCAL_REF`=yes):** push it so the worktree can branch from `origin/<EPIC_BRANCH>` (do not move or check out the local ref); now `ORIGIN_REF`=yes:
     ```
     git push -u origin <EPIC_BRANCH>:<EPIC_BRANCH>
     git fetch origin <EPIC_BRANCH>
     ```
   - **nowhere (`ORIGIN_REF`=no, `LOCAL_REF`=no):** create it from the latest default branch **without disturbing the main tree** (use `git branch`, which never touches the working tree), then push it; this sets both `LOCAL_REF`=yes and `ORIGIN_REF`=yes. Note in the final summary that the epic branch was created.
     ```
     git fetch origin <DEFAULT_BRANCH>
     git branch <EPIC_BRANCH> origin/<DEFAULT_BRANCH>
     git push -u origin <EPIC_BRANCH>
     git fetch origin <EPIC_BRANCH>
     ```

7. **Create the worktree checked out ON the epic branch** (not a new feature branch — every bead commits directly onto the epic branch), always anchored to the freshly fetched `origin/<EPIC_BRANCH>`. Choose strictly by the **recorded `LOCAL_REF`** (do not re-derive it):
   - **`LOCAL_REF`=no** (the branch exists only on origin, or was just pushed there): create the local tracking branch as part of the worktree add:
     ```
     git worktree add <WORKTREE_PATH> -b <EPIC_BRANCH> origin/<EPIC_BRANCH>
     ```
   - **`LOCAL_REF`=yes** (a local branch already existed, or you just created it with `git branch`): check it out into the worktree, then fast-forward it to the fetched origin tip so the run never starts from a stale local ref:
     ```
     git worktree add <WORKTREE_PATH> <EPIC_BRANCH>
     git -C <WORKTREE_PATH> merge --ff-only origin/<EPIC_BRANCH>
     ```
     If `merge --ff-only` fails (the local branch has diverged from origin), stop and ask — never force or rebase silently. (`merge --ff-only origin/<EPIC_BRANCH>` is used instead of `pull` so it needs no tracking config and deterministically lands on the up-to-date origin tip — picking the wrong command here is the difference between a clean start and either a hard `-b ... already exists` failure or committing the whole epic onto a stale tip that the final push then rejects non-fast-forward.)

   After this step there is a worktree at `<WORKTREE_PATH>` on a clean `<EPIC_BRANCH>` sitting at the `origin/<EPIC_BRANCH>` tip. **All remaining `git`/`bd`/`claude` work runs from inside `<WORKTREE_PATH>`** — the driver never `cd`s the main tree or switches its branch.

8. **Seed git-ignored local env files into the worktree — REQUIRED before any worker runs `build-and-test`.** A fresh worktree checks out only _tracked_ files, so git-ignored local config the build needs — `.env.local`, `.env`, and the rest of the `.env*` family — is absent, and the first worker's `build-and-test` would otherwise run against a worktree with no environment. Do this **once, up front, before the loop**, and unconditionally; do **NOT** skip or defer it on the assumption that `build-and-test` will synthesize a default environment. Run this from the main checkout (`<MAIN_ROOT>`); it reads from the main tree but never writes to it:

   ```
   git -C <MAIN_ROOT> ls-files --others --ignored --exclude-standard --directory \
     | grep -E '(^|/)\.env(\.[^/]*)?$' \
     | while IFS= read -r f; do
         mkdir -p "<WORKTREE_PATH>/$(dirname "$f")"
         cp -p "<MAIN_ROOT>/$f" "<WORKTREE_PATH>/$f"
       done
   ```

   - `--directory` collapses fully-ignored directories (`node_modules/`, `dist/`, `.beads/`, `*.db`) to a single entry so the `grep` skips them — only `.env*` files are copied, never dependencies or build output. `cp -p` preserves the source permissions (env files are often `600`).
   - Always **run** the detection command — never skip running it because you expect the output to be empty; only treat it as a no-op when its _actual_ output is empty. Never pre-judge that no `.env*` files exist because the worktree _looks_ build-ready (`.env.example` is tracked and proves nothing).
   - This `.env*` seed is the up-front, non-negotiable part. _Separately_, if a worker's `build-and-test` later fails because some **other** git-ignored config is missing (e.g. `.dev.vars`, a local service-account JSON), copy that one file the same way — but that reactive copy never replaces the up-front `.env*` seed above. Do not bulk-copy all ignored files.
   - **Do NOT seed `.beads/`, `*.db`, or `.dolt/` into the worktree** the way `.env*` is seeded. `bd` already resolves to the shared main-clone database (see step 9); copying beads state in would create a divergent or empty view — the exact failure to avoid. The `.env*` seed is the only thing copied into the worktree.

9. **Verify Beads health and connectivity inside the worktree.** The driver loop and every worker read and write bead state from within `<WORKTREE_PATH>`. This works because **`bd` is git-worktree-aware**: from inside a worktree it resolves `.beads` to the MAIN repo root via the git common dir and connects to the shared Dolt server, so the worktree and the main tree are **one** beads view (`.beads/dolt`, `issues.jsonl`, and `*.db` are git-ignored and deliberately not seeded into the worktree — see step 8).

   The authoritative health check is **`bd show <EPIC_BEAD_ID>`, not `bd where`**:

   ```
   (cd <WORKTREE_PATH> && bd show <EPIC_BEAD_ID> --json)
   ```

   - It must resolve the **same epic** AND prove the Dolt server is reachable. `bd where` only prints resolved config and **succeeds even when the server is down**, so it is not a connectivity check — rely on `bd show`.
   - **If `bd show` fails:** the most likely cause is the Dolt server being down — start it (`bd dolt start`; check `bd dolt status`) and retry. Do **not** reach for `bd bootstrap --yes` to "fix" a down server: it errors on shared-server reconcile, and in a healthy worktree it is only a no-op (it detects the existing main-clone DB). If `bd` is missing entirely, stop and report — the run cannot proceed without it.
   - **If `bd show` resolves a different or empty epic**, stop and report rather than running the loop against the wrong beads view.

10. **Show the plan, then run unattended.** Print the resolved epic, `<WORKTREE_PATH>`, `<EPIC_BRANCH>`, `<DEFAULT_BRANCH>` (the PR base), and the initial ready set (`(cd <WORKTREE_PATH> && bd ready --parent <EPIC_BEAD_ID> --json)`). State that the run will now proceed bead-by-bead without further confirmation, that the main working tree (`<MAIN_BRANCH>`) will not be touched, and that the worktree will be left in place at the end. Do not ask for per-bead confirmation after this point.

11. **The loop.** Keep three sets — `done`, `blocked`, `attempted` — and a hard iteration cap (≈ the epic's descendant count, backstop 50). **Run every `bd` and `git` command from inside `<WORKTREE_PATH>`.** Each iteration:
    1. `(cd <WORKTREE_PATH> && bd ready --parent <EPIC_BEAD_ID> --json)`; drop any bead already in `done` or `blocked`.
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

12. **Finalize** from inside `<WORKTREE_PATH>`. When the loop breaks:
    - **If nothing was delivered, skip the PR.** If `done` is empty — or `git -C <WORKTREE_PATH> rev-list --count origin/<DEFAULT_BRANCH>..<EPIC_BRANCH>` is `0` — there are no commits to base a PR on, and `gh pr create` would hard-fail with "No commits between …". Skip the push and PR; report the blocked/skipped list as the outcome instead, then jump to the summary.
    - `git -C <WORKTREE_PATH> push -u origin <EPIC_BRANCH>`
    - follow `finishing-a-development-branch` to open **one** PR: `gh pr create --base <DEFAULT_BRANCH> --title "<conventional-commit title>" --body "..."` (run from within the worktree). The body must include an `Epic: <EPIC_BEAD_ID>` line, a list of delivered beads (with ids), and a list of blocked/skipped beads with one-line reasons. If `gh` is unavailable, report the branch name and intended `--base <DEFAULT_BRANCH>` for manual PR creation instead of failing.
    - **Leave the worktree in place.** Do not remove it — the user returns to it for the epic PR's review comments, screenshots, and CI fixes. Removal is a separate manual step via the `cleanup-worktree` skill.
    - report a concise summary: **delivered** (closed + commit), **blocked/skipped** (with reasons), `<EPIC_BRANCH>`, `<DEFAULT_BRANCH>` (PR base), the PR URL, `<WORKTREE_PATH>` (with the exact `cd <WORKTREE_PATH>` to enter it), and a reminder that the main working tree (`<MAIN_BRANCH>`) was never touched. Note if the epic branch was created by this run. Because every `bd` write happened in the worktree and is committed on `<EPIC_BRANCH>`, the **main checkout's** `bd ready`/`bd show` will keep showing these beads as open/in_progress until the epic PR merges — say so, so the user doesn't think nothing happened. Point to `cleanup-worktree` for teardown.

## Per-task headless run

Run **from inside `<WORKTREE_PATH>`**, on `<EPIC_BRANCH>`, **strictly one at a time** (the workers share the worktree's working tree, so they cannot overlap). Do **not** pass `--bare` — the worker must inherit the project context (`.claude/skills/`, the repo-local `build-and-test`, the `code-reviewer` agent, MCP), which is present because the workflow surface is committed to the downstream repo's git and therefore travels into the worktree checkout:

```bash
(cd <WORKTREE_PATH> && timeout 3600 claude -p "<TASK_PROMPT>" \
  --model claude-opus-5-5 \
  --effort high \
  --dangerously-skip-permissions \
  --output-format json) \
  > "<tmp>/epic-task-<BEAD_ID>.json"
```

`<TASK_PROMPT>` instructs the worker to run the full executor cycle for **exactly** `<BEAD_ID>` and nothing else:

> You are an executor in `<WORKTREE_PATH>`, a git worktree already checked out on branch `<EPIC_BRANCH>`. Deliver bead `<BEAD_ID>` and only that bead. Run, in order: `beads-claim` (claim `<BEAD_ID>` with `bd update <BEAD_ID> --status in_progress`), `writing-plans`, implementation, `systematic-debugging` if blocked, the repo-local `build-and-test` skill (required), `verification-before-completion`, `requesting-code-review` (dispatch the code-reviewer subagent — required), then `beads-close`. **Commit your work directly on the current branch `<EPIC_BRANCH>` from inside this worktree.** Do NOT `cd` out of the worktree, do NOT create or switch branches, do NOT open a PR, do NOT push, do NOT touch any other bead. If you hit a blocker you cannot resolve, do not force it: run `bd update <BEAD_ID> --status blocked` with a short note explaining why, then stop. End your final message with one line: `RESULT: closed|blocked — <short summary>`.

Notes on the invocation:

- **The worker runs in the worktree, not the main tree.** Because `claude -p` is spawned with the worktree as its cwd, it loads the worktree's `.claude/skills/` and operates on the epic-branch checkout. The main checkout is never the worker's working directory.
- **Model and effort are pinned**, not inherited: `--model claude-opus-5-5 --effort high`. Each worker delivers a full bead (plan + implement + review), so it runs on the strongest model at high reasoning effort. `--effort` accepts `low|medium|high|xhigh|max`; raise to `xhigh` or `max` for harder epics, lower it only to economize on simple ones.
- **Why headless and not a subagent:** a subagent cannot dispatch a further subagent, so it could not run `requesting-code-review`'s `code-reviewer` subagent. A headless `claude -p` run is a top-level session, so the full cycle — including code review — works unchanged.
- **Outcome is read from `bd show` (run in the worktree), not the `RESULT:` line.** The `RESULT:` line and the worker's `.result` text are for the human summary only; the bead's actual status is authoritative.
- **Per-task timeout** (`timeout 3600`, ~1h) prevents one stuck bead from hanging the whole run. A timeout counts as a failure → force-block and skip.
- **Keep the driver thin:** capture the JSON to a temp file; do not dump the worker's full transcript into the driver context. Read back only what you need for the summary.

### Permissions posture (unattended)

An unattended worker runs arbitrary, repo-specific build/test commands, so a fixed `--allowedTools` allowlist cannot cover them. The practical default for a genuinely unattended run is `--dangerously-skip-permissions`. State this to the user before the first run — it auto-approves every tool call in the worker. The cautious alternative is `--permission-mode acceptEdits` plus a downstream `.claude/settings.json` Bash allowlist that covers the repo's build/test/git/bd commands; offer it if the user prefers a tighter posture.

### Cost note

Each `claude -p` worker is a separate session with its own token usage. On subscription plans, headless `claude -p` draws from the separate Agent SDK credit pool. A large epic spawns one worker per bead — surface this so the user opts in knowingly.

### Runtime note (Codex)

`claude -p` is Claude-Code-specific. When running under Codex there is no `claude` binary; the worker step must be adapted to the Codex headless command. Until that path is verified, this skill guards on `command -v claude` (step 3) and stops with a clear message rather than guessing the Codex invocation.

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
- **Once the worktree exists, run all loop and worker `bd`/`git`/`claude` commands from inside `<WORKTREE_PATH>`** so the workers operate on the worktree's checkout, the correct branch tip, and the worktree's `.claude/skills`. (The pre-worktree resolution/preflight/branch-setup steps necessarily run against the main repo; step 8 only reads from it.) The beads view is identical from either tree — `bd` resolves to the same main-clone DB via the git common dir — so running `bd` from the worktree is for uniformity, not because the main tree would see different beads.
- **Never remove the worktree automatically** — it stays in place after success or blocker so the user can address the epic PR's comments, capture screenshots, or fix CI. Removal is a deliberate user action via the `cleanup-worktree` skill.
- If the loop would exceed the iteration cap, stop and report rather than spinning.
- If `gh` is unavailable, push the epic branch and report the branch name plus the intended `--base <DEFAULT_BRANCH>` for manual PR creation rather than failing the whole flow.

## Integration

**Invoked by:**

- **user** — the top-level "run this whole epic in an isolated worktree" entry point.

**Invokes:**

- a fresh headless `claude -p` **executor cycle per bead** (`beads-claim` → `writing-plans` → impl → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`, committing on the epic branch inside the worktree)
- **`finishing-a-development-branch`** — once, at the end, to push and open the single epic → default-branch PR

**Pairs with:**

- **`cleanup-worktree`** — the teardown bookend. This skill creates the worktree and leaves it in place; `cleanup-worktree` removes it once the epic PR has landed (or been abandoned).

**Relation to the other epic/worktree skills:**

- Use **`executor-epic-sequential`** (non-worktree) when it is fine to switch the main checkout onto the epic branch and you want the simplest path. Use **this** skill when the main tree has in-flight work that must stay untouched, or when you want the epic to run in an isolated directory.
- Use **`executor-epic-task-worktree`** when you want each bead reviewed as its **own** PR into the epic branch (one worktree per bead, parallel-safe). Use **this** skill when you want the whole epic delivered unattended as **one** branch and **one** PR in a single worktree. All three share the `epic/<epic-bead-id>` branch convention.
