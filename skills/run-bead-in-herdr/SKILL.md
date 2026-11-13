---
name: run-bead-in-herdr
description: 'Use when `executor-epic-sequential` or `executor-epic-sequential-worktree` picked the runner `run-bead-in-herdr` in preflight (the driver runs inside Herdr, `HERDR_ENV=1`). Sets up one worker tab `<epic-id>-implementer` per run, waits for the user to start Claude Code, OpenCode or omp in it, then per bead clears that agent, sends the task prompt and waits. No headless fallback. The epic skill owns the loop and reads the outcome from Beads.'
---

# Run Bead in Herdr

Inside Herdr, every bead of an epic run executes in **one interactive agent that the user starts** in a tab the run creates, `<epic-id>-implementer`. The user picks the CLI (Claude Code, OpenCode or omp), its model, effort and flags. The driver clears that agent before every bead, sends the task prompt, and waits. The driver (the session that invoked `executor-epic-sequential*`) keeps everything else: the epic, the branch, the loop, the outcome from `bd show`, and the PR.

Why: the user can watch each bead live, the worker is a top-level session that can dispatch its own review subagent, and an interactive session bills like any other interactive session of that CLI.

## When this applies

The epic skill's preflight printed `herdr <driver-kind>`. Inside Herdr this is the only runner: there is no headless fallback and no argument that selects another one.

## Conventions

- Every Herdr command prints JSON (`{"result":…}`, or `{"error":{"code":…}}` with exit 1). Parse it; never scrape the TUI except for the one `RESULT:` line.
- **Target the pane ID, never an agent name.** A clear can drop the name. Resolve `<PANE>` once and use it everywhere.
- From Git Bash, prefix a command whose argument starts with `/` with `MSYS_NO_PATHCONV=1`, or MSYS rewrites `/clear` into a Windows path.
- Compare paths normalized: slashes unified, trailing slash dropped, case-insensitive on Windows. Herdr reports `D:\www\repo` (a new tab's root pane may add a trailing `\`), git prints `D:/www/repo`.
- Never use the driver's own pane (`$HERDR_PANE_ID`), and never use, prompt, clear or rename an agent in any other tab (the user's own `implementer` agent included).
- Never type into the worker pane with `herdr pane run` or `send-text`: if an agent is already running there, the text becomes a prompt to it.
- Reader for one pane's agent (Node is already a prerequisite of the template). `session` is an id, or a file path for omp, or `null` before the agent reports one:

  ```bash
  herdr_agent() {  # usage: herdr_agent <pane-id>  →  one JSON line, or "missing"
    herdr agent list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).result.agents.find(x=>x.pane_id===process.argv[1]);console.log(a?JSON.stringify({kind:a.agent,status:a.agent_status,session:(a.agent_session&&a.agent_session.value)||null,cwd:a.cwd}):"missing")})' "$1"
  }
  ```

## Agent kinds

Observed with Herdr 0.9.5, Claude Code 2.1, OpenCode 2.2.6 and omp 18.18.8:

| `kind` | Suggested start command (user's choice) | Clear command | New session id appears | Interrupt keys |
|---|---|---|---|---|
| `claude` | `claude --dangerously-skip-permissions` | `/clear` | right after the clear | `esc` |
| `opencode` | `opencode --yolo` | `/new` | only once the next prompt starts (before the first prompt the session is `null`) | `esc esc` (`ctrl+c` quits OpenCode) |
| `omp` | `omp --yolo` | `/new` (`/clear` keeps the session id) | right after the clear | `esc` |

Any other `kind` is unsupported: say so and wait (setup step 4).

## Worker tab setup — once per run

Runs at the end of the epic skill's checkout setup, before "run unattended". `<CHECKOUT>` is the repo root (on `<EPIC_BRANCH>`) or the worktree.

1. `<NAME>` = `<EPIC_BEAD_ID>-implementer`, made a valid Herdr name: lowercase, every character outside `a-z 0-9 _ -` becomes `-`, must start with a letter (prefix `e-` if not), at most 32 characters. A user hook may rename a Claude agent from its tab label after `/clear`, so the label must stay a valid agent name.
2. Find or create the tab:
   - `herdr tab list --workspace "$HERDR_WORKSPACE_ID"`: if a tab's `label` is `<NAME>`, reuse it as `<TAB>` (a later run of the same epic lands here).
   - otherwise: `herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "<CHECKOUT>" --label "<NAME>" --no-focus` and record `.result.tab.tab_id` as `<TAB>`.
   - `<PANE>` = the pane of `<TAB>` from `herdr pane list --workspace "$HERDR_WORKSPACE_ID"` (a new tab's `.result.root_pane.pane_id`). If the tab has several panes, use the one with a supported agent, else the first.
3. If `herdr_agent <PANE>` already shows a supported kind, `idle` or `done`, with cwd = `<CHECKOUT>`, go to step 5 without asking. Otherwise ask the user, once, and **stop and wait for their reply**:

   > The worker tab `<NAME>` is ready. Please start the coding agent you want for this epic in it, in `<CHECKOUT>`, for example `claude --dangerously-skip-permissions`, `opencode --yolo` or `omp --yolo` (any model, effort and flags are your choice; skipping permissions keeps it from stopping on approval prompts). Answer any startup dialog it shows, then reply `done`.

   Never start the CLI, type into the pane, or answer its dialogs yourself.
4. On `done`, check `herdr_agent <PANE>`: `kind` is `claude`, `opencode` or `omp`; `status` is `idle` or `done`; cwd equals `<CHECKOUT>`. If not, say exactly what was found (`missing`, the kind, `blocked` = a startup dialog such as the folder-trust prompt is still open, or the other cwd) and wait for another `done`. Never go headless, never start an agent yourself.
5. Record `<KIND>`. Tell the user once: beads run in `<NAME>` (pane `<PANE>`, kind `<KIND>`), the agent is cleared before every bead, any dialog it raises comes back to them, and the tab stays open after the run.

## Per bead

`<WORKER_TIMEOUT>` comes from the epic skill in seconds (`3600`); the waits below use milliseconds.

1. **Clear, always** (before the first bead too: the user may have used the agent). Record `OLD_SESSION` = `session` from `herdr_agent <PANE>`. Send `<KIND>`'s clear command **without `--wait`** (a clear never enters `working`, so `--wait` returns `agent_prompt_stalled`):

   ```bash
   MSYS_NO_PATHCONV=1 herdr agent prompt "<PANE>" "/clear"   # /new for opencode and omp
   ```

2. **Settle.** Poll `herdr_agent <PANE>` every 2 s for up to 10 s, until the status is `idle` or `done`. A changed session id here is fine; **no change is not yet a failure** (OpenCode only reports its new session once the next prompt starts). `missing` means the agent is gone: stop the loop and report.

3. **Send the bead** from the file, then confirm the turn started:

   ```bash
   herdr agent prompt "<PANE>" "$(cat "<PROMPT_FILE>")" --wait --until working --until blocked --timeout 30000
   ```

   - Once the status is `working`, `herdr_agent <PANE>`'s session **must differ from `OLD_SESSION`**. If it does not, the clear did not take: send `<KIND>`'s interrupt keys (`herdr agent send-keys "<PANE>" esc`, or `esc esc` for opencode), force-block the bead (`bd update <BEAD_ID> --status blocked` with "run-bead-in-herdr: clear did not start a new session"), skip it. Two such failures in a row: stop the loop and finalize with what was delivered.
   - `agent_prompt_stalled` or `timeout`: treat as a timeout (step 5).

4. **Wait** in chunks that fit a tool call, with the tool call's own timeout set to 10 minutes:

   ```bash
   herdr agent wait "<PANE>" --timeout $((9 * 60 * 1000))   # 9 minutes; returns on idle, done or blocked
   ```

   Repeat while it returns `timeout` and the total is under `<WORKER_TIMEOUT>` × 1000 ms. Between chunks print one progress line (bead id, minutes elapsed), nothing more.

5. **Result.**
   - `idle` or `done`: the epic skill checks `bd show`.
   - `blocked` (a permission dialog, a question, or a session error): show the user `herdr agent read "<PANE>" --source recent-unwrapped --lines 60` and ask whether they answer it in the pane or skip the bead. **Never answer it yourself.** Answered → wait again (step 4). Skip → as a timeout.
   - Timeout or stall: send `<KIND>`'s interrupt keys, force-block the bead ("run-bead-in-herdr: worker timed out"), skip it. **Never re-send the prompt.**

6. **Summary line.** Read only the last result line (OpenCode draws a side panel, so cut at the first run of three spaces):

   ```bash
   herdr agent read "<PANE>" --source recent-unwrapped --lines 200 | grep -oE 'RESULT: (closed|blocked).*' | tail -1 | sed 's/   .*//'
   ```

   If the agent is idle, the bead is still `in_progress` and there is no `RESULT:` line, the worker stopped early: force-block the bead ("run-bead-in-herdr: worker ended without closing the bead").

## End of run

Leave `<TAB>` and its agent in place. The summary names `<NAME>`, `<PANE>` and how to close it: `herdr tab close <TAB>` (close it before removing a worktree with `cleanup-worktree`). The driver never closes a tab or pane.

## Hard rules

<HARD-GATE>
Inside Herdr the worker is the agent the user started in `<NAME>`. If there is no supported idle agent there after `done`, the driver waits for the user. It NEVER runs the bead headless, NEVER starts a CLI in the pane, and NEVER implements bead work in its own context: not a one-line bead, not when the user is slow to answer, not when only one bead is left.
</HARD-GATE>

<HARD-GATE>
The driver NEVER answers the worker's dialogs, permission prompts or questions, and types into its pane nothing but the clear command, the task prompt, and the interrupt keys on timeout. A dialog goes to the user.
</HARD-GATE>

- One bead at a time. Never prompt the agent while it is working; never re-send a prompt for the same bead.
- Every command targets `<PANE>`. Never touch another tab's agent or the driver's own pane; never kill the Herdr server; never close a tab or pane.
- Keep the driver thin: progress lines, `bd show`, and the one `RESULT:` line.

## Integration

**Invoked by:** `executor-epic-sequential` (`<CHECKOUT>` = repo root) and `executor-epic-sequential-worktree` (`<CHECKOUT>` = the worktree), when preflight printed `herdr …`.

**Invokes:** nothing. The worker agent runs the executor cycle from the task prompt (`beads-claim` → `writing-plans` → impl → `build-and-test` → `verification-before-completion` → `requesting-code-review` → `beads-close`).

**Needs:** the driver in a Herdr pane (`HERDR_ENV=1`, `HERDR_WORKSPACE_ID`), `herdr` and Node on `PATH`, and the user at hand to start the worker once per run.

**Siblings:** `run-bead-headless-claude`, `run-bead-headless-opencode`, `run-bead-headless-omp`.
