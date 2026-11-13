---
name: run-bead-headless-opencode
description: 'Use when `executor-epic-sequential` or `executor-epic-sequential-worktree` picked the runner `run-bead-headless-opencode` in preflight (driver is OpenCode, not inside Herdr). Runs one bead in a fresh headless `opencode run` worker from the checkout and reports its exit code and last `RESULT:` line. No loop logic: the epic skill owns the loop and reads the outcome from Beads.'
---

# Run Bead Headless (OpenCode)

One bead, one fresh `opencode run` process. The epic skill passes `<CHECKOUT>`, `<BEAD_ID>`, `<PROMPT_FILE>` (the task prompt), `<RUN_TMP>` and `<WORKER_TIMEOUT>` (seconds) and keeps everything else: the loop, the outcome check from `bd show`, and the PR.

## When this applies

The epic skill's preflight printed `headless opencode`: the driver is an OpenCode session (`OPENCODE=1`, `OMPCODE` not `1`) and `HERDR_ENV` is not `1`.

## Preflight

- `command -v opencode` must succeed; otherwise stop: this runner needs the `opencode` CLI on `PATH`.
- Say once, before the first bead: each worker runs with `--yolo` (an alias of `--auto`: tool calls are auto-approved, explicit `deny` rules in the user's OpenCode config still apply), on OpenCode's default model unless the user named one, billed to that model's provider, one session per bead.

## Per bead

Run this with the shell tool's `background: true` and wait for the completion notification; do not poll. (A foreground call would hit the tool's own timeout long before an hour-long bead ends.)

```bash
cd "<CHECKOUT>" && timeout <WORKER_TIMEOUT> opencode run --standalone --yolo \
  --title "<BEAD_ID> epic worker" \
  "$(cat "<PROMPT_FILE>")" \
  < /dev/null > "<RUN_TMP>/<BEAD_ID>.out" 2> "<RUN_TMP>/<BEAD_ID>.err"; echo "exit=$?"
```

- `opencode run` has no directory flag: it works in the process cwd, hence the `cd`.
- `< /dev/null` is required: with an open non-TTY stdin, `opencode run` waits for it and never starts.
- Never pass `--agent`: the worker is OpenCode's default agent, which loads the checkout's `.claude/skills/` and `AGENTS.md`. Add `--model <provider/model[#variant]>` only when the user named a model for this run.
- Exit `124` means the worker hit `<WORKER_TIMEOUT>`: report "timed out". Any other non-zero exit: report the exit code and the last 20 lines of the `.err` file (progress lines go there too).
- For the summary, read only the last result line. Never paste the rest of the output into the driver:

  ```bash
  grep -aE 'RESULT: (closed|blocked)' "<RUN_TMP>/<BEAD_ID>.out" | tail -1
  ```

## Hard rules

- One worker at a time, never retried, never switched to another CLI. A failed or timed-out bead is the epic skill's to block and skip.
- The `RESULT:` line is for the human summary only. The epic skill reads the outcome from `bd show <BEAD_ID> --json`.

## Integration

**Invoked by:** `executor-epic-sequential` and `executor-epic-sequential-worktree`, once per bead, when preflight picked this runner.

**Siblings:** `run-bead-headless-claude`, `run-bead-headless-omp`, `run-bead-in-herdr`.
