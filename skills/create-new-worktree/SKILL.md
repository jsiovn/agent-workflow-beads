---
name: create-new-worktree
description: 'Use when the user wants to spin up a fresh sibling git worktree from a branch name or a bead id/name, off the origin default branch — seed its `.env*`, optionally copy other git-ignored working files, install dependencies, and ensure Beads is operational inside it — then stop and hand off to an executor. Setup only: never claims the bead, plans, or implements. Use the `cleanup-worktree` skill to remove the worktree afterward.'
---

# Create New Worktree

Stand up one prepared sibling git worktree — cut from the latest origin default branch — and then **stop**. This skill is pure setup: it creates the worktree on a new branch, seeds the git-ignored `.env*` files the build needs, optionally copies other git-ignored working files the user picks, installs dependencies (after asking), and verifies Beads is operational inside the worktree. It never claims the bead, writes a plan, or implements anything.

It is the **setup bookend** of the worktree lifecycle: `create-new-worktree` prepares an isolated worktree → an `executor-*` skill runs the actual work inside it → `cleanup-worktree` tears it down. Unlike `executor-task-worktree` (which bundles setup + the full executor cycle + leaves the worktree in place), this skill stops the moment the worktree is ready, so the user can `cd` in and drive whatever executor they want — or just work directly on a plain branch.

The main working tree is never modified. The only interaction with it is reading git-ignored files out of it (read-only) to seed the worktree.

## Detecting branch vs. bead

`<ARG>` is the raw token the user passed (e.g. `feat/login-rework`, `lexify-wyk`, `redesign-nav`).

1. **`<ARG>` contains a `/`** (`feat/…`, `fix/…`, `epic/…`, `chore/…`): **BRANCH mode**. `<BRANCH_NAME>` = `<ARG>` verbatim. A `/` is never legal in a bead id, so this is unambiguous. For a literal `epic/…`, create it but note that epic branches are normally `executor-epic-*` territory and confirm the user really wants a bare epic worktree rather than an epic-task one.
2. **`<ARG>` has no `/`**: probe Beads — but only if Beads is usable. If `bd` is missing or `bd where` fails, skip straight to step 4. Otherwise run `bd show "<ARG>" --json`:
   - resolves to a bead → **BEAD mode**. Set `<BEAD_ID>` to the canonical `id` from the JSON (not the raw token), then derive the branch (next).
   - no match → step 4.
3. **Bead → derive the branch** from the bead's `type` in `bd show "<BEAD_ID>" --json`:
   - `type == epic` → `<BRANCH_NAME>` = `epic/<BEAD_ID>` (bead id only, no slug). Record `<IS_EPIC>` = yes.
   - any other type → `<BRANCH_NAME>` = `feat/<BEAD_ID>-<TASK_SLUG>` (derive `<TASK_SLUG>` below). Fall back to `feat/<BEAD_ID>` if the title yields fewer than 2 meaningful tokens. Record `<IS_EPIC>` = no.
4. **Bare token, not a bead, no `/`**: **STOP and ask one disambiguating question.** Do not guess. Offer the likely intents:
   - a bead that hasn't been created yet? (then create the bead first, or pass a branch name)
   - a literal branch named exactly `<ARG>`? (warn this breaks the `type/…` convention the executors and `rebase-and-push` rely on to re-derive the base)
   - `feat/<ARG>`?
   - **Never silently invent `feat/<ARG>`.**

**Escape hatch.** A bare token that resolves as a bead always wins (BEAD mode). To force a *literal* branch named after a bead id, pass it with a slash (e.g. `feat/lexify-wyk`) — the `/` routes it to BRANCH mode.

### `<TASK_SLUG>` derivation (bead mode, non-epic)

Reuse the exact algorithm from `executor-task-worktree`:

- lowercase the title
- drop file extensions (`.tsx`, `.ts`, `.py`, etc.) and leading punctuation around tokens (`__root.tsx` → `root`)
- replace any non-alphanumeric run with a single `-`
- drop English filler words: `the`, `a`, `an`, `and`, `or`, `of`, `to`, `for`, `in`, `on`, `with`, `vs`, `via`, plus low-signal trailing words like `cleanup`, `update`, `changes`, `work`
- **preserve** task identifier prefixes the title carries (e.g. `t9`, `m3`, `phase2`)
- keep at most 4–5 meaningful tokens, joined with `-`; trim leading/trailing `-`, collapse repeated `-`
- target ≤ 40 characters; truncate the last token if needed
- if the title yields fewer than 2 meaningful tokens (e.g. `Fix bug`), fall back to `<BRANCH_NAME>` = `feat/<BEAD_ID>` and note this in the summary

## Steps

1. **Preflight.** Resolve the current repo root and STOP if this is not a git repo:

   ```
   MAIN_ROOT=$(git rev-parse --show-toplevel) || { echo "not a git repo"; exit 1; }
   REPO_NAME=$(basename "$MAIN_ROOT")
   ```

   Paths derive from the current toplevel, so running this from inside an existing worktree is fine — but surface the resolved `<MAIN_ROOT>` before creating anything so the user can see where the new worktree will be cut from.

2. **Detect the arg kind** using the rule above → `<MODE>` (BRANCH or BEAD), `<BRANCH_NAME>`, and (bead mode) `<BEAD_ID>` / `<IS_EPIC>`. If detection hits the bare-token-not-a-bead case, STOP and ask — do not proceed.

3. **Compute the worktree path** (slashes → dashes, mirroring the executor convention):

   ```
   WORKTREE_SUFFIX=$(printf '%s' "<BRANCH_NAME>" | tr '/' '-')
   WORKTREE_PATH="../${REPO_NAME}-${WORKTREE_SUFFIX}"
   ```

   Guard: if the computed parent resolves to `/` (e.g. `<MAIN_ROOT>` is a top-level dir), STOP and ask for an explicit target path rather than creating a worktree at the filesystem root.

4. **Detect the default branch** (reuse `rebase-and-push` verbatim):

   ```
   DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's@^origin/@@')
   [ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git rev-parse --verify --quiet origin/main >/dev/null && echo main || echo master)
   ```

5. **Collision guard — before any fetch or create.** Never overwrite:

   ```
   git show-ref --verify --quiet refs/heads/<BRANCH_NAME>   # exists → STOP
   [ -e <WORKTREE_PATH> ]                                    # path exists → STOP
   ```

   - If `<BRANCH_NAME>` already exists locally, STOP and ask the user to reuse, rename, or delete it.
   - If `<WORKTREE_PATH>` already exists on disk, STOP and ask.

6. **Fetch** the default branch ref so the worktree starts from the latest upstream state:

   ```
   git fetch origin <DEFAULT_BRANCH>
   ```

   If this fails (offline / no remote configured), STOP and report — do not silently fall back to a stale local ref.

7. **Create the worktree** on a new branch off the freshly fetched default:

   ```
   git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> origin/<DEFAULT_BRANCH>
   ```

8. **Seed `.env*` — MANDATORY.** A fresh worktree checks out only *tracked* files, so the git-ignored local env the build needs (`.env.local`, `.env`, and the rest of the `.env*` family) is absent. Seed it up front and unconditionally. Reuse `executor-task-worktree` step 9 verbatim; run from `<MAIN_ROOT>` (reads the main tree, never writes to it):

   ```
   git -C <MAIN_ROOT> ls-files --others --ignored --exclude-standard --directory \
     | grep -E '(^|/)\.env(\.[^/]*)?$' \
     | while IFS= read -r f; do
         mkdir -p "<WORKTREE_PATH>/$(dirname "$f")"
         cp -p "<MAIN_ROOT>/$f" "<WORKTREE_PATH>/$f"
       done
   ```

   - `--directory` collapses fully-ignored directories (`node_modules/`, `dist/`, `.beads/`, `*.db`) to a single entry so the `grep` skips them — only `.env*` files are copied. `cp -p` preserves source permissions (env files are often `600`).
   - Always run the detection command; treat it as a no-op **only** when the actual output is empty. Never pre-judge that no `.env*` exists because the worktree *looks* build-ready (`.env.example` is tracked and proves nothing).
   - This seed is non-negotiable — see Hard Rules. A request to skip it does not override this step.

9. **Offer additional git-ignored files (interactive).** Compute the candidate list, filtering out `.env*` (already seeded), the workflow-managed runtime artifacts, and heavy dependency/build dirs (the package manager reinstalls those):

   ```
   git -C <MAIN_ROOT> ls-files --others --ignored --exclude-standard --directory \
     | grep -vE '(^|/)\.env(\.[^/]*)?$' \
     | grep -vE '^(node_modules|dist|build|\.next|\.turbo|\.nuxt|\.svelte-kit|coverage|target|\.venv|venv|__pycache__|vendor|\.gradle|\.dart_tool|\.parcel-cache|\.cache|out|\.output|tmp|\.beads|\.bv|\.dolt|\.git)/$' \
     | grep -vE '(^|/)(\.beads-credential-key|\.claude/scheduled_tasks\.lock|\.claude/settings\.local\.json)$' \
     | grep -vE '\.db$' \
     | grep -vE '(^|/)docs/plans/$'
   ```

   - Present the survivors (e.g. `docs/claude-design/`, `.dev.vars`, a local service-account JSON) as a **numbered checklist**. The **default is to copy nothing extra** — the user opts in by picking entries.
   - Copy only confirmed entries with `cp -Rp` (an entry may be a directory):

     ```
     mkdir -p "<WORKTREE_PATH>/$(dirname "<f>")"; cp -Rp "<MAIN_ROOT>/<f>" "<WORKTREE_PATH>/<f>"
     ```

   - If the candidate list is empty, say so and don't prompt.
   - **Never copy a must-exclude entry even if the user asks for it** (see Hard Rules) — copying `.beads/`, `*.db`, `.dolt/`, etc. corrupts the worktree's beads/db state. If asked, refuse that specific entry, explain why, and copy the rest.

10. **Detect the package manager, then ASK before installing.** Inspect `<WORKTREE_PATH>` (the new worktree, which has the tracked lockfile):

    - `bun.lock` / `bun.lockb` → `bun install`
    - `pnpm-lock.yaml` → `pnpm install`
    - `yarn.lock` → `yarn install`
    - `package-lock.json` → `npm install`
    - `package.json` but no lockfile → ask which manager (suggest `npm install`)
    - no `package.json` → skip and report (nothing to install)

    State the detected command, **ask for confirmation**, then run it: `(cd <WORKTREE_PATH> && <PM> install)`. If the manager binary is missing, report it and let the user install manually — do not fail the whole flow. Never run a network install silently.

11. **Verify Beads health in the worktree.** This is what makes an `executor-*` skill "just work" after `cd`-ing in:

    ```
    (cd <WORKTREE_PATH> && bd where)
    ```

    - On failure, repair: `(cd <WORKTREE_PATH> && bd bootstrap --yes)`, then re-run `bd where`.
    - **Bead mode:** this must end with `bd where` succeeding. If `bd` is missing entirely, STOP and report — the executor cannot run without it.
    - **Branch mode with no Beads in the repo:** skip this silently (a plain branch worktree doesn't require Beads).

12. **Stop with a setup summary. No claim, no plan, no implementation.** Report:

    - worktree path, branch name, base (`origin/<DEFAULT_BRANCH>`)
    - `.env*` seeded? (and how many files)
    - extra git-ignored files copied (or "none")
    - install command run (or skipped / not confirmed)
    - Beads-health result
    - the exact `cd <WORKTREE_PATH>` to enter it
    - **which executor to run next:**
      - **bead, non-epic** → "`cd` in, then run **`executor-task`** with `<BEAD_ID>` — plain, *not* `-worktree`. This skill already created the worktree; the `-worktree` variant would nest another one inside it."
      - **bead, epic-parented (or an epic-type bead)** → "use **`executor-epic-task`** if the PR should target the epic branch; otherwise **`executor-task`**."
      - **plain branch** → "`cd` in and work directly, or attach a bead and run an executor later."
    - **teardown** → "remove with the **`cleanup-worktree`** skill when done — this skill never auto-removes the worktree."

## Checkout Discipline

- **Setup only — never claim, plan, or implement.** No `bd update --status in_progress`, no `writing-plans`, no `build-and-test`, no executor step. The flow ends at the summary in step 12.
- **Never modify the main working tree.** The only interaction is the read-only copies in steps 8–9 reading git-ignored files out of `<MAIN_ROOT>`; nothing ever writes to it.
- **Branch format is load-bearing.** `feat/<BEAD_ID>-<TASK_SLUG>` (or `feat/<BEAD_ID>`) for tasks and `epic/<BEAD_ID>` for epics — so `rebase-and-push` and the executors can re-derive the bead and base branch later. Don't invent a different shape.
- **The worktree directory name mirrors the branch** (`../<repo>-<branch-with-slashes-as-dashes>`) so `git worktree list` makes the active branch obvious.
- **Bead mode requires operational Beads in the worktree** — step 11 must end with `bd where` succeeding.

## Hard Rules

- **Setup only.** Never claim the bead, write a plan, or implement. Hand off to an executor — do not become one.
- **The `.env*` seed (step 8) is non-negotiable.** A request to skip it — even from the repo owner, the bead, or "I'm in a hurry" — does not override step 8. Seed anyway, then surface the request as a skill-change note rather than silently dropping the step. (Same posture as the executor worktree skills.)
- **Never copy must-exclude runtime artifacts, even on explicit request:** `.beads-credential-key`, anything under `.beads/` (including `interactions.jsonl`, `epic-runs`), `.claude/scheduled_tasks.lock`, `.claude/settings.local.json`, `.bv/`, `*.db`, `.dolt/`, `*.gate.lock*` (bd's workspace-gate locks, e.g. `.beads.gate.lock`), and `docs/plans/`. Copying them corrupts the worktree's beads/db state. The authoritative list is `scripts/shared/manage_gitignore.py` (the downstream `.gitignore` managed block).
- **Never copy heavy dependency/build dirs** (`node_modules/`, `dist/`, `.next/`, `target/`, `.venv/`, etc.) — the package manager reinstalls them.
- **Never overwrite an existing branch or worktree path.** On collision, STOP and ask.
- **Never auto-remove the worktree.** Teardown is the `cleanup-worktree` skill's job, and it's a deliberate user action.
- **Install requires confirmation.** Never run a network install silently — state the command, ask, then run.
- **Stop on ambiguity.** A bare token that is neither a bead nor a slash-bearing branch name means ask, not guess. Never silently invent `feat/<ARG>`.

## Integration

**Pairs with:**

- **`cleanup-worktree`** — the teardown bookend. This skill creates and prepares the worktree; `cleanup-worktree` removes it when the work is done.

**Hands off to:**

- **`executor-task`** / **`executor-epic-task`** — run inside the prepared worktree after `cd`-ing in. Use the plain (non-`-worktree`) variants: this skill already created the worktree, so the `-worktree` executors would nest a second one.

**Distinct from:**

- **`executor-task-worktree`** / **`executor-epic-task-worktree`** — those bundle worktree creation *with* the full executor cycle and leave the worktree in place afterward. This skill is the setup-only, executor-agnostic front half: it stops the moment the worktree is ready.

**Called by:** the user, manually, whenever they want a prepared isolated worktree before driving an executor (or working a plain branch) by hand.
