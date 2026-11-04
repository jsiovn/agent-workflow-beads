# Headless worker notes (`executor-epic-sequential-worktree`)

Read this file before the first per-task headless run, and state the permissions and cost points to the user before the loop starts.

## Notes on the invocation

- **The worker runs in the worktree, not the main tree.** Because `claude -p` is spawned with the worktree as its cwd, it loads the worktree's `.claude/skills/` and operates on the epic-branch checkout. The main checkout is never the worker's working directory.
- **Model and effort are pinned**, not inherited: `--model claude-opus-5-5 --effort high`. Each worker delivers a full bead (plan + implement + review), so it runs on the strongest model at high reasoning effort. `--effort` accepts `low|medium|high|xhigh|max`; raise to `xhigh` or `max` for harder epics, lower it only to economize on simple ones.
- **Why headless and not a subagent:** a subagent cannot dispatch a further subagent, so it could not run `requesting-code-review`'s `code-reviewer` subagent. A headless `claude -p` run is a top-level session, so the full cycle — including code review — works unchanged.
- **Outcome is read from `bd show` (run in the worktree), not the `RESULT:` line.** The `RESULT:` line and the worker's `.result` text are for the human summary only; the bead's actual status is authoritative.
- **Per-task timeout** (`<WORKER_TIMEOUT>` = `3600`, ~1h; `5400` when `<IMPLEMENTOR>`=`opencode`, to fit nested implementor rounds) prevents one stuck bead from hanging the whole run. A timeout counts as a failure → force-block and skip.
- **Keep the driver thin:** capture the JSON to a temp file; do not dump the worker's full transcript into the driver context. Read back only what you need for the summary.

## Permissions posture (unattended)

An unattended worker runs arbitrary, repo-specific build/test commands, so a fixed `--allowedTools` allowlist cannot cover them. The practical default for a genuinely unattended run is `--dangerously-skip-permissions`. State this to the user before the first run — it auto-approves every tool call in the worker. The cautious alternative is `--permission-mode acceptEdits` plus a downstream `.claude/settings.json` Bash allowlist that covers the repo's build/test/git/bd commands; offer it if the user prefers a tighter posture.

## Cost note

Each `claude -p` worker is a separate session with its own token usage. On subscription plans, headless `claude -p` draws from the separate Agent SDK credit pool. A large epic spawns one worker per bead — surface this so the user opts in knowingly.

Workers inherit the machine's global Claude Code hooks, so if rtk is set up (`agent-workflow-beads check` reports it) every worker's Bash output is condensed too; `rtk gain` afterwards shows the saving. The driver's own decisions read only `bd … --json` and git plumbing, which rtk passes through unchanged.

## Implementor note (OpenCode)

In OpenCode mode the worker stays a headless `claude -p` session — it plans, runs `build-and-test`, verification, and code review, and closes the bead — but each implementation round is a nested `opencode run --agent implementor` launched by `implement-with-opencode` from inside `<WORKTREE_PATH>`. The implementor's agent file denies branch/push/PR/`bd` writes, so the epic-branch and Beads invariants above still hold. Outcome is still read from `bd show`; a bead whose implementor rounds are exhausted is blocked by its worker and skipped like any other failure.
