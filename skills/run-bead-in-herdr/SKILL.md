---
name: run-bead-in-herdr
description: 'Use when `executor-epic-sequential` or `executor-epic-sequential-worktree` was invoked with the Herdr runner argument (`herdr`, `herdr=<agent>`, `--runner herdr [--agent <name>]`, or `runner=herdr`). Replaces the per-bead headless `claude -p` worker with a named interactive Claude agent in a Herdr pane: `/clear` it, prompt it with the bead, wait, then read the outcome from Beads. The driver must be running inside Herdr (`HERDR_ENV=1`).'
---

# Run Bead in Herdr

Run each bead of an epic-sequential run in a **named interactive Claude agent inside Herdr** instead of a fresh headless `claude -p` process. The driver (the orchestrator session that invoked `executor-epic-sequential*`) keeps every other step: resolving the epic, the branch, the loop, the outcome check from `bd show`, and the single PR. This skill owns only the Herdr mechanics: preflight, `/clear`, prompt, wait, and cleanup.

Why: a Herdr agent is a top-level interactive session the user can watch live, it can still dispatch the `code-reviewer` subagent, and it draws from the interactive subscription pool rather than the Agent SDK pool that headless `claude -p` uses.

## When this applies

Only when the epic skill was invoked with the runner argument. Recognized forms (anywhere in the arguments):

- bare `herdr`
- `herdr=<agent>`
- `--runner herdr`, optionally with `--agent <name>`
- `runner=herdr`

Record `<RUNNER>` (`headless` by default, `herdr` when requested) and `<HERDR_AGENT>` (default `implementer`). It combines with `opencode`: the Herdr agent becomes the worker and calls `implement-with-opencode` itself, exactly like a headless worker would. **No argument → the epic skill uses `claude -p`; this skill does not apply.**

## Conventions

- Every Herdr command prints JSON (`{"result":…}` on success, `{"error":{"code":…}}` and exit 1 on failure). Parse it; never scrape the TUI.
- **Target the pane ID, never the agent name.** `/clear` starts a new Claude session and drops the agent's name; only a user hook may restore it. Resolve `<PANE>` once in preflight and use it for every later command.
- From Git Bash, prefix any command whose argument starts with `/` with `MSYS_NO_PATHCONV=1`, or MSYS rewrites `/clear` into a Windows path.
- Normalize paths before comparing them: Herdr reports `D:\www\repo`, `git rev-parse --show-toplevel` prints `D:/www/repo`. Compare with slashes unified and, on Windows, case-insensitively.
- A small reader for one pane's agent, used below (Node is already a prerequisite of the template):

  ```bash
  herdr_agent() {  # usage: herdr_agent <pane-id>  →  "<session-id> <status> <cwd>"  or  "missing"
    herdr agent list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).result.agents.find(x=>x.pane_id===process.argv[1]);console.log(a?[(a.agent_session&&a.agent_session.value)||"-",a.agent_status,a.cwd].join(" "):"missing")})' "$1"
  }
  ```

## Preflight — stop on any failure, never fall back to headless

The user chose Herdr, so a failed preflight stops the run. Do not silently switch to `claude -p`.

1. `HERDR_ENV` is `1` and `command -v herdr` succeeds. Otherwise stop: "Herdr runner requested but this session is not inside Herdr."
2. Resolve the worker agent:
   - **Main-checkout mode** (`executor-epic-sequential`; `<CHECKOUT>` = the repo root, already on `<EPIC_BRANCH>`): find the entry in `herdr agent list` whose `name` is `<HERDR_AGENT>`. Record its `pane_id` as `<PANE>`.
   - **Worktree mode** (`executor-epic-sequential-worktree`; `<CHECKOUT>` = `<WORKTREE_PATH>`): create a dedicated agent, see _Worktree mode_ below. The user's own `<HERDR_AGENT>` is never used or touched in this mode.
3. Check the agent: it exists, `agent` is `claude`, `agent_status` is `idle` or `done`, and its `cwd` equals `<CHECKOUT>` (normalized). A wrong cwd means the worker would load another checkout's skills and commit on another branch: stop and tell the user which cwd the agent has.
4. Never use the driver's own pane as `<PANE>` (`$HERDR_PANE_ID`). A driver that `/clear`s itself ends the run.
5. Tell the user once, before the first bead: the worker is an interactive agent they can watch in Herdr; it should run with permissions bypassed (or an allowlist) so it does not stop on approval prompts; any dialog it raises is brought back to the user, never answered by the driver.

## Worktree mode — a dedicated agent per run

The worktree has its own cwd, so the user's `<HERDR_AGENT>` (started in the main checkout) cannot serve it. Create one agent for the whole run:

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "<WORKTREE_PATH>" \
  --label "<HERDR_AGENT>-<EPIC_BEAD_ID>" --no-focus          # → result.tab.tab_id = <TAB>
herdr pane list --workspace "$HERDR_WORKSPACE_ID"           # the pane whose tab_id is <TAB> = <PANE>
herdr agent start "<HERDR_AGENT>-<EPIC_BEAD_ID>" --kind claude --pane "<PANE>" \
  --timeout 60000 -- --dangerously-skip-permissions
```

- Agent names must match `[a-z][a-z0-9_-]{0,31}`; lowercase the label and trim it if needed.
- Record `<TAB>` as created by this run. It is the only tab the driver may close.
- If `agent start` returns `agent_not_ready`, Claude is showing a startup dialog (usually the folder-trust prompt for the new worktree). Show the user `herdr agent read "<PANE>" --source recent-unwrapped --lines 40` and ask them to answer it in the pane; do not answer it yourself. Then `herdr agent wait "<PANE>" --until idle --timeout 120000` before continuing.
- After `agent start` succeeds, run preflight check 3 against `<PANE>` (cwd must equal `<WORKTREE_PATH>`).
- If any of the three commands fails, close `<TAB>` if it was created, and stop.
- The new agent starts with an empty context, so the first bead may skip `/clear` (step 1 below still works if you run it).

## Per bead

Run one bead at a time. `<WORKER_TIMEOUT_MS>` is `3600000` (one hour), or `5400000` when `<IMPLEMENTOR>`=`opencode`.

1. **Clear the agent.** Record `OLD_SESSION` from `herdr_agent <PANE>`, then send `/clear` **without `--wait`**:

   ```bash
   MSYS_NO_PATHCONV=1 herdr agent prompt "<PANE>" "/clear"
   ```

   Do not add `--wait`: `/clear` never enters the `working` state, so `--wait` returns `agent_prompt_stalled` even when the clear worked.

2. **Confirm the clear.** Poll `herdr_agent <PANE>` every 2 s for up to about 30 s until the session id differs from `OLD_SESSION` and the status is `idle` or `done`.
   - **No change within 30 s is a failure.** Do not prompt the bead into a context that may still hold the previous bead. Force-block the bead (`bd update <BEAD_ID> --status blocked` with "run-bead-in-herdr: /clear did not start a new session") and skip it.
   - Two clear failures in a row mean the agent is unusable: stop the loop and finalize with what was delivered.
   - `missing` means the pane or agent is gone: stop the loop and report.

3. **Send the bead.** `<TASK_PROMPT>` is the epic skill's headless prompt **verbatim** (plus its `opencode` addendum when set), followed by:

   > You are running inside Herdr with no one watching this pane. Never ask questions (no AskUserQuestion, no "should I…?"); if you are blocked, run `bd update <BEAD_ID> --status blocked` with a short note and stop. Do not run long work in the background; run commands in the foreground and wait for them.

   ```bash
   herdr agent prompt "<PANE>" "<TASK_PROMPT>" --wait --until working --until blocked --timeout 30000
   ```

   This only confirms the turn started. `agent_prompt_stalled` or `timeout` here → treat as a timeout (step 5).

4. **Wait for the turn to end** in chunks that fit a tool call's time limit (Claude Code caps a foreground command at 10 minutes):

   ```bash
   herdr agent wait "<PANE>" --timeout 540000     # matches idle, done or blocked
   ```

   Repeat while it returns `timeout` and the total wait is under `<WORKER_TIMEOUT_MS>`. Between chunks, print one line of progress (bead id, minutes elapsed), nothing more. A harness that can notify on a background command's exit may run one wait in the background instead.

5. **Handle the result.**
   - `idle` or `done`: go to the outcome check (step 6).
   - `blocked`: the agent is showing a dialog (a permission prompt, a question). The driver is the live orchestrator, so show the user `herdr agent read "<PANE>" --source recent-unwrapped --lines 60` and ask whether to answer the dialog themselves or skip the bead. **Never answer the dialog yourself.** If the user answers it, resume waiting (step 4). If they choose skip, do what a timeout does.
   - Total wait reached `<WORKER_TIMEOUT_MS>`, or step 3 stalled: interrupt the agent with `herdr agent send-keys "<PANE>" esc`, then `herdr agent send-keys "<PANE>" ctrl+c`, force-block the bead ("run-bead-in-herdr: worker timed out"), and skip it. **Never re-send the prompt.**

6. **Outcome.** The epic skill decides done vs blocked from `bd show <BEAD_ID> --json`, exactly as for a headless worker. For the summary only, read the worker's last `RESULT:` line:

   ```bash
   herdr agent read "<PANE>" --source recent-unwrapped --lines 40
   ```

   Keep only the last line that starts with `RESULT:`; never paste the rest of the pane into the driver's context. If the agent is idle, the bead is still `in_progress`, and there is no `RESULT:` line, the worker stopped early: force-block the bead ("run-bead-in-herdr: worker ended without closing the bead").

After the epic's PR is opened (or the run stops), in worktree mode close the tab this run created: `herdr tab close "<TAB>"`. In main-checkout mode leave `<HERDR_AGENT>` as it is.

## Hard rules

<HARD-GATE>
The driver NEVER implements bead work, in Herdr mode as in headless mode. The Herdr agent is the worker; the driver only sends `/clear`, sends the prompt, waits, and reads `bd show` plus one `RESULT:` line. Not a one-line bead, not when the agent looks stuck, not when only one bead is left.
</HARD-GATE>

<HARD-GATE>
The driver NEVER answers the worker's blocked dialogs, permission prompts, or questions, and never types into its pane beyond `/clear`, the task prompt, and the `esc` / `ctrl+c` interrupt on timeout. A dialog goes to the live user.
</HARD-GATE>

- One bead at a time. Never prompt the agent while it is working, and never re-send a prompt for the same bead.
- Every command targets `<PANE>`, never the agent name.
- Never kill the Herdr server, never close a pane or tab this run did not create, never `/clear` the driver's own pane.
- A failed preflight stops the run. Never fall back to `claude -p` without the user saying so in this session.
- Keep the driver thin: progress lines, `bd show`, and the `RESULT:` line only.

## Integration

**Invoked by:** `executor-epic-sequential` (main-checkout mode) and `executor-epic-sequential-worktree` (worktree mode), only when `<RUNNER>`=`herdr`.

**Invokes:** nothing directly. The Herdr agent runs the same executor cycle a headless worker runs (`beads-claim` → `writing-plans` → impl → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`), and `implement-with-opencode` inside it when `<IMPLEMENTOR>`=`opencode`.

**Needs:** Herdr with the driver running in a Herdr pane (`HERDR_ENV=1`), `herdr` on `PATH`, Node on `PATH` for the reader above, and, in main-checkout mode, a Claude agent named `<HERDR_AGENT>` started in the repo root.
