---
name: run-bead-headless-claude
description: 'Use when `executor-epic-sequential` or `executor-epic-sequential-worktree` picked the runner `run-bead-headless-claude` in preflight (driver is Claude Code, not inside Herdr). Runs one bead in a fresh headless `claude -p` worker from the checkout and reports its exit code and last `RESULT:` line. No loop logic: the epic skill owns the loop and reads the outcome from Beads.'
---

# Run Bead Headless (Claude Code)

One bead, one fresh `claude -p` process. The epic skill passes `<CHECKOUT>`, `<BEAD_ID>`, `<PROMPT_FILE>` (the task prompt), `<RUN_TMP>` and `<WORKER_TIMEOUT>` (seconds) and keeps everything else: the loop, the outcome check from `bd show`, and the PR.

## When this applies

The epic skill's preflight printed `headless claude`: the driver is a Claude Code session (neither `OMPCODE` nor `OPENCODE` is `1`) and `HERDR_ENV` is not `1`.

## Preflight

- `command -v claude` must succeed; otherwise stop: this runner needs the `claude` CLI on `PATH`.
- Say once, before the first bead: each worker runs with `--dangerously-skip-permissions` (every tool call auto-approved), and on subscription plans headless `claude -p` draws from the separate Agent SDK credit pool, one session per bead.

## Per bead

Run this with the Bash tool's `run_in_background: true` and wait for the exit notification. A foreground call is capped at 10 minutes and a bead can take an hour. Do not poll the output file while it runs.

```bash
cd "<CHECKOUT>" && timeout <WORKER_TIMEOUT> claude -p "$(cat "<PROMPT_FILE>")" \
  --model claude-opus-5-5 \
  --effort high \
  --dangerously-skip-permissions \
  --output-format json \
  < /dev/null > "<RUN_TMP>/<BEAD_ID>.out" 2> "<RUN_TMP>/<BEAD_ID>.err"; echo "exit=$?"
```

- Do **not** pass `--bare`: the worker must load the checkout's `.claude/skills/`, the repo-local `build-and-test`, the `code-reviewer` agent and MCP.
- Model and effort are pinned, not inherited. Raise `--effort` to `xhigh` or `max` for a hard epic; lower it only to economize.
- `< /dev/null` stops `claude -p` from waiting for stdin data.
- Exit `124` means the worker hit `<WORKER_TIMEOUT>`: report "timed out". Any other non-zero exit: report the exit code and the last 20 lines of the `.err` file.
- For the summary, read only the last result line, from the JSON's `result` field. Never paste the rest of the output into the driver:

  ```bash
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result||"";console.log(r.split("\n").filter(l=>/^RESULT: (closed|blocked)/.test(l)).pop()||"no RESULT line")' "<RUN_TMP>/<BEAD_ID>.out"
  ```

## Hard rules

- One worker at a time, never retried, never switched to another CLI. A failed or timed-out bead is the epic skill's to block and skip.
- The `RESULT:` line is for the human summary only. The epic skill reads the outcome from `bd show <BEAD_ID> --json`.
- Why a process and not a subagent: a subagent cannot dispatch the `code-reviewer` subagent; a `claude -p` run is a top-level session and can.

## Integration

**Invoked by:** `executor-epic-sequential` and `executor-epic-sequential-worktree`, once per bead, when preflight picked this runner.

**Siblings:** `run-bead-headless-opencode`, `run-bead-headless-omp`, `run-bead-in-herdr`.
