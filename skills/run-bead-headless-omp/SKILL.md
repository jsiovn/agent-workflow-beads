---
name: run-bead-headless-omp
description: 'Use when `executor-epic-sequential` or `executor-epic-sequential-worktree` picked the runner `run-bead-headless-omp` in preflight (driver is omp, not inside Herdr). Runs one bead in a fresh headless `omp -p` worker from the checkout and reports its exit code and last `RESULT:` line. No loop logic: the epic skill owns the loop and reads the outcome from Beads.'
---

# Run Bead Headless (omp)

One bead, one fresh `omp -p` process. The epic skill passes `<CHECKOUT>`, `<BEAD_ID>`, `<PROMPT_FILE>` (the task prompt), `<RUN_TMP>` and `<WORKER_TIMEOUT>` (seconds) and keeps everything else: the loop, the outcome check from `bd show`, and the PR.

## When this applies

The epic skill's preflight printed `headless omp`: the driver is an omp session (`OMPCODE=1`; omp also sets `CLAUDECODE=1`, which is why `OMPCODE` is checked first) and `HERDR_ENV` is not `1`.

## Preflight

- `command -v omp` must succeed; otherwise stop: this runner needs the `omp` CLI on `PATH`.
- Say once, before the first bead: each worker runs with `--yolo` (an alias of `--auto-approve`: every tool call auto-approved), on omp's default model unless the user named one, billed to that model's provider, one session per bead.

## Per bead

Run this with the bash tool's `timeout: 0` (no tool timeout; the `timeout <WORKER_TIMEOUT>` in the command is the limit). If omp moves the call to a background job, wait for its result; do not poll.

```bash
cd "<CHECKOUT>" && timeout <WORKER_TIMEOUT> omp -p --yolo --wait-async \
  "$(cat "<PROMPT_FILE>")" \
  < /dev/null > "<RUN_TMP>/<BEAD_ID>.out" 2> "<RUN_TMP>/<BEAD_ID>.err"; echo "exit=$?"
```

- `< /dev/null` is required: an open empty stdin pipe blocks `omp -p` at startup.
- `--wait-async` is required: without it, print mode cancels background subagents at exit, so a review subagent the worker started (the general-subagent fallback of `requesting-code-review` is not blocking) would be dropped.
- In print mode stdout holds only the final assistant text. Exit `0` is success, `1` an error or abort, `3` the cost cap.
- Add `--model <id>` or `--thinking <level>` only when the user named them for this run.
- Exit `124` means the worker hit `<WORKER_TIMEOUT>`: report "timed out". Any other non-zero exit: report the exit code and the last 20 lines of the `.err` file.
- For the summary, read only the last result line. Never paste the rest of the output into the driver:

  ```bash
  grep -aE 'RESULT: (closed|blocked) ' "<RUN_TMP>/<BEAD_ID>.out" | tail -1
  ```

## Hard rules

- One worker at a time, never retried, never switched to another CLI. A failed or timed-out bead is the epic skill's to block and skip.
- The `RESULT:` line is for the human summary only. The epic skill reads the outcome from `bd show <BEAD_ID> --json`.

## Integration

**Invoked by:** `executor-epic-sequential` and `executor-epic-sequential-worktree`, once per bead, when preflight picked this runner.

**Siblings:** `run-bead-headless-claude`, `run-bead-headless-opencode`, `run-bead-in-herdr`.
