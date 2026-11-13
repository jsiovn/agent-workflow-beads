---
name: executor-epic-sequential
description: 'Run every ready child bead of one epic end-to-end, sequentially, on a single epic branch (epic/<epic-bead-id>). Each bead executes in a fresh worker session through the runner picked in preflight: inside Herdr, an agent the user starts in the tab `<epic-id>-implementer`, cleared before every bead; outside Herdr, a headless run of the CLI the driver runs in (`claude -p`, `opencode run` or `omp -p`). A failed bead is marked blocked and skipped (along with its dependents) and the run continues; finishes with one PR from the epic branch to the default branch. Use when the user wants to deliver a whole epic unattended as one branch and one PR instead of running one bead at a time.'
---

# Executor Epic Sequential

Drive an entire epic to completion in one go: create **one** epic branch, then execute **every ready child bead** of that epic, one after another, each in its **own fresh worker session** so no task's context leaks into the next. Every task commits directly onto the single epic branch. At the end, open **one** PR from the epic branch to the default branch.

This is the "run the whole epic" entry point. The four `executor-*-task` skills each deliver exactly one bead; this skill loops over all of them on a single integration branch without the operator babysitting each one.

## Iron Law

**ONE epic branch. EVERY bead runs in a fresh worker session through `<RUNNER>`. The driver NEVER implements bead work in its own context.**

The entire point of this skill is to keep the driver session thin: only short per-task summaries and `git`/`bd` output land in the driver's context, while the heavy implement/test/review transcript for each bead lives in a worker session that is thrown away (or cleared) when the bead finishes. The model cannot clear itself mid-run, so the only ways to get a clean slate per task are a fresh process per task or a cleared separate agent. Doing a bead "inline" — even a one-line one — re-pollutes the driver context and defeats the skill.

## Requires fresh-session-safe beads

Each worker starts with **zero memory** of the planner chat or of the beads that ran before it. It can only see the bead contract, persisted inputs, and the code on the epic branch. If the epic's beads are not fresh-session-safe, workers will fail. Recommend running `validate-beads` on the epic first (don't force it).

## Worker

The skill takes only the epic id. Words such as `opencode` or `herdr` from older versions of this skill are ignored; say so once. The runner is picked once, in preflight, with a command that works in any shell:

```bash
node -e "const e=process.env;console.log((e.HERDR_ENV==='1'?'herdr':'headless')+' '+(e.OMPCODE==='1'?'omp':e.OPENCODE==='1'?'opencode':'claude'))"
```

| Output | `<RUNNER>` | Each bead runs in |
|---|---|---|
| `herdr …` | `run-bead-in-herdr` | the agent the user starts in the Herdr tab `<epic-id>-implementer`, cleared before every bead |
| `headless claude` | `run-bead-headless-claude` | a fresh `claude -p` |
| `headless opencode` | `run-bead-headless-opencode` | a fresh `opencode run` |
| `headless omp` | `run-bead-headless-omp` | a fresh `omp -p` |

Inside Herdr there is no headless fallback. Each runner skill owns its own commands; this skill only hands it `<CHECKOUT>`, `<BEAD_ID>`, `<PROMPT_FILE>`, `<RUN_TMP>` and `<WORKER_TIMEOUT>`.

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps. If `bd where` fails, repair with `bd bootstrap --yes` before continuing.

2. **Resolve the epic — before touching the working tree:**
   - if the user supplied an epic id, use it
   - otherwise infer the epic from the current request/context and confirm
   - verify it is actually an epic: `bd show <EPIC_BEAD_ID> --json` and check `type == epic`. If it is not an epic, stop and ask for the epic id.
   - record the epic bead id as `<EPIC_BEAD_ID>` and `<EPIC_BRANCH>` as `epic/<EPIC_BEAD_ID>` — **no slug** (same convention as `executor-epic-task`; using just the bead id prevents duplicate branches when different sessions derive different slugs).

3. **Preflight (fail fast, stop on any failure):**
   - **A POSIX shell is required.** `timeout 2 node -e "setTimeout(()=>{},5000)"; echo $?` must print `124`. Anything else (OpenCode on Windows runs PowerShell unless its `shell` config key points at Git Bash) → stop and ask the user to run this from Git Bash, or to set `"shell"` in `opencode.json` to Git Bash's `bash.exe`.
   - **Pick `<RUNNER>`** with the one-liner in _Worker_ and run that runner's preflight: a headless runner checks its CLI is on `PATH`; `run-bead-in-herdr` checks `command -v herdr` (its worker tab is set up at the end of step 4).
   - **The working tree must be clean.** Run `git status --porcelain`; if anything is dirty, stop and ask the user to commit or stash first. This skill runs unattended across many tasks and switches to the epic branch — it must not auto-`stash` or auto-WIP-commit and risk losing or mixing in unrelated work. (This intentionally diverges from `executor-task`, which auto-WIP-commits a single switch.)
   - Record the starting branch (`git rev-parse --abbrev-ref HEAD`) as `<PREV_BRANCH>` so you can report where the user came from.
   - Make `<RUN_TMP>` = `$(mktemp -d)` for prompt files and worker output, outside the repo.

4. **Create or resolve the epic branch ONCE** (reuse `executor-epic-task` logic):
   - detect `<DEFAULT_BRANCH>`: `git symbolic-ref refs/remotes/origin/HEAD` if present, else `main` if it exists, else `master`
   - try `git rev-parse --verify <EPIC_BRANCH>` (local), then `git ls-remote --exit-code --heads origin <EPIC_BRANCH>` (remote)
   - **exists locally:** `git checkout <EPIC_BRANCH>` then `git pull --ff-only` (only if it has an upstream). If `pull --ff-only` fails (divergence), stop and ask — never force or rebase silently.
   - **exists only remotely:** `git fetch origin <EPIC_BRANCH>` then `git checkout -b <EPIC_BRANCH> origin/<EPIC_BRANCH>`
   - **exists nowhere:** create it from the latest default branch:
     ```
     git fetch origin <DEFAULT_BRANCH>
     git checkout -b <EPIC_BRANCH> origin/<DEFAULT_BRANCH>
     git push -u origin <EPIC_BRANCH>
     ```
     Note in the final summary that the epic branch was created.
   - After this step the driver session is on `<EPIC_BRANCH>` with a clean tree. Do **not** create any other branch for the rest of the run. `<CHECKOUT>` = the repo root.
   - **`<RUNNER>` = `run-bead-in-herdr` only:** run its _Worker tab setup_ with `<CHECKOUT>`. It asks the user to start an agent in the tab `<epic-id>-implementer` and waits for `done`; this is the last interactive step.

5. **Show the plan, then run unattended.** Print the resolved epic, `<EPIC_BRANCH>`, the initial ready set (`bd ready --parent <EPIC_BEAD_ID> --json`), and one `Worker:` line: for Herdr, `Worker: Herdr tab <NAME>, pane <PANE>, <KIND>, cleared before every bead`; headless, `Worker: headless <cli>, one fresh session per bead`. State that the run will now proceed bead-by-bead without further confirmation. Do not ask for per-bead confirmation after this point.

6. **The loop.** Keep three sets — `done`, `blocked`, `attempted` — and a hard iteration cap (≈ the epic's descendant count, backstop 50). Each iteration:
   1. `bd ready --parent <EPIC_BEAD_ID> --json`; drop any bead already in `done` or `blocked`.
   2. If the remaining set is empty, **break** — the epic has no more ready work.
   3. Pick the next bead: lowest priority number first (highest priority), ties broken by id for determinism. Record it as `<BEAD_ID>` and add it to `attempted`.
   4. **Execute `<BEAD_ID>` in a fresh worker session.** Write `<TASK_PROMPT>` (below) to `<PROMPT_FILE>` = `<RUN_TMP>/<BEAD_ID>.prompt` with a quoted heredoc (`cat > "<PROMPT_FILE>" <<'EOF'`; the prompt contains backticks), then follow `<RUNNER>`'s _Per bead_ steps with `<CHECKOUT>`, `<BEAD_ID>`, `<PROMPT_FILE>`, `<RUN_TMP>` and `<WORKER_TIMEOUT>` = `3600` seconds. Exactly one at a time.
   5. **Determine the outcome from Beads, never from the worker's self-report:** `bd show <BEAD_ID> --json`.
      - **First-bead guard:** if this is the first bead of the run and it is still `open` after its worker, the runner itself is broken (bad CLI flags, no auth, prompt never arrived). Stop the run: do not block the bead, show the runner's exit code and the last 20 lines of its output, open no PR.
      - status `closed` → add to `done`. Sanity-check that a new commit landed on `<EPIC_BRANCH>` (`git log --oneline <DEFAULT_BRANCH>..HEAD`); if nothing was committed, treat as blocked.
      - status `blocked` → add to `blocked`, record the bead's blocker note.
      - still `open`/`in_progress` (worker crashed, timed out, or no-op'd) → force `bd update <BEAD_ID> --status blocked` with a reason like "executor-epic-sequential: worker ended without closing the bead", add to `blocked`.
   6. **Infinite-loop guard:** a bead in `attempted` must end each iteration in `done` or `blocked`. If it is neither, force-block it (step 6.5 covers this). Because failed/blocked beads stay out of `bd ready`, their dependents never become ready — that is exactly the skip-and-continue behavior. Never re-run a bead that is already in `attempted` and still not `done`.

7. **Finalize.** When the loop breaks:
   - **If nothing was delivered, skip the PR.** If `done` is empty or `git rev-list --count origin/<DEFAULT_BRANCH>..<EPIC_BRANCH>` is `0`, `gh pr create` would fail with "No commits between …": report the blocked/skipped list instead and go to the summary.
   - `git push -u origin <EPIC_BRANCH>`
   - follow `finishing-a-development-branch` to open **one** PR: `gh pr create --base <DEFAULT_BRANCH> --title "<conventional-commit title>" --body "..."`. The body must include an `Epic: <EPIC_BEAD_ID>` line, a list of delivered beads (with ids), and a list of blocked/skipped beads with one-line reasons. If `gh` is unavailable, report the branch name and intended `--base <DEFAULT_BRANCH>` for manual PR creation instead of failing.
   - report a concise summary table: **delivered** (closed + commit), **blocked/skipped** (with reasons), `<EPIC_BRANCH>`, the PR URL, and `<PREV_BRANCH>` so the user knows where they started. With Herdr, name the worker tab (left open) and `herdr tab close <TAB>`. Leave the user on `<EPIC_BRANCH>`.

## Task prompt

`<TASK_PROMPT>` is the same for every runner. It instructs the worker to run the full executor cycle for **exactly** `<BEAD_ID>` and nothing else:

> You are an executor in `<repo path>`, already checked out on branch `<EPIC_BRANCH>`. Deliver bead `<BEAD_ID>` and only that bead. Run, in order: `beads-claim` (claim `<BEAD_ID>` with `bd update <BEAD_ID> --status in_progress`), `writing-plans`, implementation, `systematic-debugging` if blocked, the repo-local `build-and-test` skill (required), `verification-before-completion`, `requesting-code-review` (required), then `beads-close`. Skills live in `.claude/skills/<name>/SKILL.md`: load each by name, or read that file. **Commit your work directly on the current branch `<EPIC_BRANCH>`.** Do NOT create or switch branches, do NOT open a PR, do NOT push, do NOT touch any other bead. Nobody is watching this session: never ask questions or wait for confirmation, and run every command in the foreground (no background jobs). If you hit a blocker you cannot resolve, do not force it: run `bd update <BEAD_ID> --status blocked` with a short note explaining why, then stop. End your final message with one line: `RESULT: closed|blocked — <short summary>`.

Notes:

- **Outcome is read from `bd show`, not the `RESULT:` line.** The runner reads only the last `RESULT:` line, for the human summary.
- **Per-task timeout** (`<WORKER_TIMEOUT>` = `3600` s) keeps one stuck bead from hanging the run. A timeout counts as a failure → force-block and skip.
- **Keep the driver thin:** worker output stays in `<RUN_TMP>` (or the Herdr pane); read back only what the summary needs.

### Permissions and cost

An unattended worker runs arbitrary build/test commands, so a fixed allowlist cannot cover them. Headless workers run with permissions bypassed (`--dangerously-skip-permissions` for Claude Code, `--yolo` for OpenCode and omp); the runner says so before the first bead, together with how that CLI bills one session per bead. A Herdr worker runs with whatever flags the user started it with; suggest bypassing permissions so it does not stop on approval prompts.

## Hard Rules

<HARD-GATE>
The driver MUST give every bead a fresh worker session through `<RUNNER>`: a new headless process, or a confirmed clear of the Herdr worker agent. It MUST NOT implement, edit, or "just quickly finish" any bead in its own context — not even a one-line bead, not when only one bead is left, not when spawning feels like overhead. Inside Herdr it MUST NOT fall back to a headless worker or start a CLI itself; with no worker agent it waits for the user. Inline work re-pollutes the driver context and is the exact failure this skill exists to prevent.
</HARD-GATE>

<HARD-GATE>
ONE branch, ONE PR. Never create a per-task feature branch, never open a per-task PR, never push mid-run except the final `git push` of the epic branch. Every bead commits directly onto `<EPIC_BRANCH>`; the only PR is `<EPIC_BRANCH>` → `<DEFAULT_BRANCH>` at the very end.
</HARD-GATE>

- **Skip-and-continue is mandatory.** A bead that fails or blocks is marked `blocked` and skipped; the run continues with the next ready bead. Never halt the whole run on a single bead's failure (the first-bead guard is the one exception: it proves the runner, not the bead, is broken), and never retry a blocked bead in a loop.
- **Outcome from Beads, not self-report.** Always read `bd show <BEAD_ID> --json` to decide done vs blocked.
- **Never operate from a dirty epic branch**, and never rebase or force-push the epic or default branch during the run. (To refresh the epic branch against the default branch out of band — e.g. before the single PR merges — use the user-invoked `rebase-and-push` skill.)
- **Sequential only.** One worker at a time — they share the working tree.
- If the loop would exceed the iteration cap, stop and report rather than spinning.

## Integration

**Invoked by:**

- **user** — the top-level "run this whole epic" entry point (`/executor-epic-sequential <epic-id>` in Claude Code, `/skill:executor-epic-sequential <epic-id>` in omp, by skill name in OpenCode).

**Invokes:**

- **`<RUNNER>`**, once per bead — `run-bead-in-herdr`, `run-bead-headless-claude`, `run-bead-headless-opencode` or `run-bead-headless-omp` — and through it a fresh **executor cycle per bead** (`beads-claim` → `writing-plans` → impl → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`, committing on the epic branch)
- **`finishing-a-development-branch`** — once, at the end, to push and open the single epic → default-branch PR

**Relation to the per-bead skills:** use `executor-epic-task` (or its worktree variant) when you want each bead reviewed as its own PR into the epic branch; use **this** skill when you want the whole epic delivered unattended as one branch and one PR. Both share the `epic/<epic-bead-id>` branch convention.
