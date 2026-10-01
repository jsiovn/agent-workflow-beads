---
name: executor-epic-sequential
description: 'Run every ready child bead of one epic end-to-end, sequentially, on a single epic branch (epic/<epic-bead-id>). Each bead executes in a fresh headless `claude -p` session so context never carries between tasks; a failed bead is marked blocked and skipped (along with its dependents) and the run continues; finishes with one PR from the epic branch to the default branch. Use when the user wants to deliver a whole epic unattended as one branch and one PR instead of running one bead at a time.'
---

# Executor Epic Sequential

Drive an entire epic to completion in one go: create **one** epic branch, then execute **every ready child bead** of that epic, one after another, each in its **own fresh headless `claude -p` session** so no task's context leaks into the next. Every task commits directly onto the single epic branch. At the end, open **one** PR from the epic branch to the default branch.

This is the "run the whole epic" entry point. The four `executor-*-task` skills each deliver exactly one bead; this skill loops over all of them on a single integration branch without the operator babysitting each one.

## Iron Law

**ONE epic branch. EVERY bead runs in its own fresh headless `claude -p` session. The driver NEVER implements bead work in its own context.**

The entire point of this skill is to keep the driver session thin: only short per-task summaries and `git`/`bd` output land in the driver's context, while the heavy implement/test/review transcript for each bead lives in a disposable headless session that is thrown away when the bead finishes. The model cannot `/clear` itself mid-run, so the _only_ way to get a clean slate per task is to spawn a fresh process per task. Doing a bead "inline" — even a one-line one — re-pollutes the driver context and defeats the skill.

## Requires fresh-session-safe beads

Each headless worker starts with **zero memory** of the planner chat or of the beads that ran before it. It can only see the bead contract, persisted inputs, and the code on the epic branch. If the epic's beads are not fresh-session-safe, workers will fail. Recommend running `validate-beads` on the epic first (don't force it).

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps. If `bd where` fails, repair with `bd bootstrap --yes` before continuing.

2. **Resolve the epic — before touching the working tree:**
   - if the user supplied an epic id, use it
   - otherwise infer the epic from the current request/context and confirm
   - verify it is actually an epic: `bd show <EPIC_BEAD_ID> --json` and check `type == epic`. If it is not an epic, stop and ask for the epic id.
   - record the epic bead id as `<EPIC_BEAD_ID>` and `<EPIC_BRANCH>` as `epic/<EPIC_BEAD_ID>` — **no slug** (same convention as `executor-epic-task`; using just the bead id prevents duplicate branches when different sessions derive different slugs).

3. **Preflight (fail fast, stop on any failure):**
   - **The working tree must be clean.** Run `git status --porcelain`; if anything is dirty, stop and ask the user to commit or stash first. This skill runs unattended across many tasks and switches to the epic branch — it must not auto-`stash` or auto-WIP-commit and risk losing or mixing in unrelated work. (This intentionally diverges from `executor-task`, which auto-WIP-commits a single switch.)
   - **The headless runner must exist.** Run `command -v claude`. If it is missing, stop and tell the user this skill needs the `claude` CLI on `PATH` to spawn per-task sessions. (Under Codex, see _Runtime note_ below.)
   - Record the starting branch (`git rev-parse --abbrev-ref HEAD`) as `<PREV_BRANCH>` so you can report where the user came from.

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
   - After this step the driver session is on `<EPIC_BRANCH>` with a clean tree. Do **not** create any other branch for the rest of the run.

5. **Show the plan, then run unattended.** Print the resolved epic, `<EPIC_BRANCH>`, and the initial ready set (`bd ready --parent <EPIC_BEAD_ID> --json`). State that the run will now proceed bead-by-bead without further confirmation. Do not ask for per-bead confirmation after this point.

6. **The loop.** Keep three sets — `done`, `blocked`, `attempted` — and a hard iteration cap (≈ the epic's descendant count, backstop 50). Each iteration:
   1. `bd ready --parent <EPIC_BEAD_ID> --json`; drop any bead already in `done` or `blocked`.
   2. If the remaining set is empty, **break** — the epic has no more ready work.
   3. Pick the next bead: lowest priority number first (highest priority), ties broken by id for determinism. Record it as `<BEAD_ID>` and add it to `attempted`.
   4. **Execute `<BEAD_ID>` in a fresh headless session** — see _Per-task headless run_ below. Run exactly one at a time.
   5. **Determine the outcome from Beads, never from the worker's self-report:** `bd show <BEAD_ID> --json`.
      - status `closed` → add to `done`. Sanity-check that a new commit landed on `<EPIC_BRANCH>` (`git log --oneline <DEFAULT_BRANCH>..HEAD`); if nothing was committed, treat as blocked.
      - status `blocked` → add to `blocked`, record the bead's blocker note.
      - still `open`/`in_progress` (worker crashed, timed out, or no-op'd) → force `bd update <BEAD_ID> --status blocked` with a reason like "executor-epic-sequential: headless run ended without closing the bead", add to `blocked`.
   6. **Infinite-loop guard:** a bead in `attempted` must end each iteration in `done` or `blocked`. If it is neither, force-block it (step 6.5 covers this). Because failed/blocked beads stay out of `bd ready`, their dependents never become ready — that is exactly the skip-and-continue behavior. Never re-run a bead that is already in `attempted` and still not `done`.

7. **Finalize.** When the loop breaks:
   - `git push -u origin <EPIC_BRANCH>`
   - follow `finishing-a-development-branch` to open **one** PR: `gh pr create --base <DEFAULT_BRANCH> --title "<conventional-commit title>" --body "..."`. The body must include an `Epic: <EPIC_BEAD_ID>` line, a list of delivered beads (with ids), and a list of blocked/skipped beads with one-line reasons. If `gh` is unavailable, report the branch name and intended `--base <DEFAULT_BRANCH>` for manual PR creation instead of failing.
   - report a concise summary table: **delivered** (closed + commit), **blocked/skipped** (with reasons), `<EPIC_BRANCH>`, the PR URL, and `<PREV_BRANCH>` so the user knows where they started. Leave the user on `<EPIC_BRANCH>`.

## Per-task headless run

Run from the repo root, on `<EPIC_BRANCH>`, **strictly one at a time** (the workers share the working tree, so they cannot overlap). Do **not** pass `--bare` — the worker must inherit the project context (`.claude/skills/`, the repo-local `build-and-test`, the `code-reviewer` agent, MCP):

```bash
timeout 3600 claude -p "<TASK_PROMPT>" \
  --model claude-opus-5-5 \
  --effort high \
  --dangerously-skip-permissions \
  --output-format json \
  > "<tmp>/epic-task-<BEAD_ID>.json"
```

`<TASK_PROMPT>` instructs the worker to run the full executor cycle for **exactly** `<BEAD_ID>` and nothing else:

> You are an executor in `<repo path>`, already checked out on branch `<EPIC_BRANCH>`. Deliver bead `<BEAD_ID>` and only that bead. Run, in order: `beads-claim` (claim `<BEAD_ID>` with `bd update <BEAD_ID> --status in_progress`), `writing-plans`, implementation, `systematic-debugging` if blocked, the repo-local `build-and-test` skill (required), `verification-before-completion`, `requesting-code-review` (dispatch the code-reviewer subagent — required), then `beads-close`. **Commit your work directly on the current branch `<EPIC_BRANCH>`.** Do NOT create or switch branches, do NOT open a PR, do NOT push, do NOT touch any other bead. If you hit a blocker you cannot resolve, do not force it: run `bd update <BEAD_ID> --status blocked` with a short note explaining why, then stop. End your final message with one line: `RESULT: closed|blocked — <short summary>`.

Notes on the invocation:

- **Model and effort are pinned**, not inherited: `--model claude-opus-5-5 --effort high`. Each worker delivers a full bead (plan + implement + review), so it runs on the strongest model at high reasoning effort rather than whatever default the environment carries. `--effort` accepts `low|medium|high|xhigh|max`; raise to `xhigh` or `max` for harder epics, lower it only to economize on simple ones.
- **Why headless and not a subagent:** a subagent cannot dispatch a further subagent, so it could not run `requesting-code-review`'s `code-reviewer` subagent. A headless `claude -p` run is a top-level session, so the full cycle — including code review — works unchanged.
- **Outcome is read from `bd show`, not the `RESULT:` line.** The `RESULT:` line and the worker's `.result` text are for the human summary only; the bead's actual status is authoritative.
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
ONE branch, ONE PR. Never create a per-task feature branch, never open a per-task PR, never push mid-run except the final `git push` of the epic branch. Every bead commits directly onto `<EPIC_BRANCH>`; the only PR is `<EPIC_BRANCH>` → `<DEFAULT_BRANCH>` at the very end.
</HARD-GATE>

- **Skip-and-continue is mandatory.** A bead that fails or blocks is marked `blocked` and skipped; the run continues with the next ready bead. Never halt the whole run on a single bead's failure, and never retry a blocked bead in a loop.
- **Outcome from Beads, not self-report.** Always read `bd show <BEAD_ID> --json` to decide done vs blocked.
- **Never operate from a dirty epic branch**, and never rebase or force-push the epic or default branch during the run. (To refresh the epic branch against the default branch out of band — e.g. before the single PR merges — use the user-invoked `rebase-and-push` skill.)
- **Sequential only.** One headless worker at a time — they share the working tree.
- If the loop would exceed the iteration cap, stop and report rather than spinning.

## Integration

**Invoked by:**

- **user** — the top-level "run this whole epic" entry point.

**Invokes:**

- a fresh headless `claude -p` **executor cycle per bead** (`beads-claim` → `writing-plans` → impl → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`, committing on the epic branch)
- **`finishing-a-development-branch`** — once, at the end, to push and open the single epic → default-branch PR

**Relation to the per-bead skills:** use `executor-epic-task` (or its worktree variant) when you want each bead reviewed as its own PR into the epic branch; use **this** skill when you want the whole epic delivered unattended as one branch and one PR. Both share the `epic/<epic-bead-id>` branch convention.
