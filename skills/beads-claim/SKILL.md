---
name: beads-claim
description: 'Use at the start of an executor session to find and claim a ready bead. Do not invoke in planner sessions.'
---

# Beads Claim

**Workflow position:** Executor session, step 1 of 8. Next: `writing-plans`. See `BEADS_WORKFLOW.md`.

Find a ready bead and claim it for this session.

<HARD-GATE>
This is an executor skill. It must not be invoked in a planner session.

Only invoke this skill when:

- the user wants to start implementation
- the session is an executor session

Do not invoke this skill when:

- beads were just created in this session
- you are in the middle of `brainstorming` or `beads-planner`
  </HARD-GATE>

## Steps

1. If the current repo is not initialized for Beads, stop and tell the user to run the template bootstrap script or at minimum `bd init --prefix <prefix>` plus the repo scaffolding steps.
2. Find ready work:
   ```bash
   bd ready --json --brief
   ```
3. Select a bead. If the user specified one, use that. Otherwise, choose the best ready bead based on current context, priority, and dependencies. `--brief` omits descriptions and notes to keep the list small; step 4 reads the full bead.
4. Show the bead details before claiming:
   ```bash
   bd show <id> --json
   ```
5. Confirm or auto-claim:
   - present the bead title and description first
   - if this skill was invoked by one of the `executor-*` orchestrator skills and the bead choice is unambiguous, proceed without an extra confirmation turn
   - if the choice is ambiguous, ask the user before claiming
6. Claim it atomically (sets you as assignee and status `in_progress`; idempotent if you already hold it, and it refuses a bead someone else claimed):
   ```bash
   bd update <id> --claim
   ```
7. Report the claimed bead id and title, then proceed to `writing-plans` for the execution plan.

## Rules

- Only claim one bead per executor session.
- If no beads are ready, report that and suggest running a planner session first.
- If the user already specified a bead id, skip the selection step but still show details before claiming.
- When an `executor-*` orchestrator skill is driving the flow, it is valid to claim without confirmation when bead choice is unambiguous.
- Do not start coding before claiming. The bead must be `in_progress` before any implementation.
