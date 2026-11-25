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
   bd ready --json
   ```
3. Select a bead. If the user specified one, use that. Otherwise, choose the best ready bead based on current context, priority, and dependencies.
4. Show the bead details before claiming:
   ```bash
   bd show <id> --json
   ```
5. Confirm or auto-claim:
   - present the bead title and description first
   - if this skill was invoked by one of the `executor-*` orchestrator skills and the bead choice is unambiguous, proceed without an extra confirmation turn
   - if the choice is ambiguous, ask the user before claiming
6. Claim it:
   ```bash
   bd update <id> --status in_progress
   ```
7. Resolve the base commit of this bead's change (read-only; nothing is written):

   **Change scope:** every file in `git diff --name-only <BASE>..HEAD` plus every path in `git status --porcelain`; never `git diff HEAD` alone, which is empty once the work is committed. `<BASE>` = `git merge-base HEAD origin/<branch this work merges into>` (the PR base: the default branch or `epic/<id>`), unless the task prompt, or the `Base-SHA:` note of the bead this session is executing, names a commit between that merge-base and HEAD: then that commit.

   The branch this work merges into is the one the executor named (`<DEFAULT_BRANCH>` or `<EPIC_BRANCH>`), else the default branch. With no `origin/<branch>` ref, use the local branch.
8. Report the claimed bead id, title and `<BASE>` (short SHA), then proceed to `writing-plans` for the execution plan. Later steps (`build-and-test`, `verification-before-completion`, `requesting-code-review`) use the same `<BASE>`.

## Rules

- Only claim one bead per executor session.
- If no beads are ready, report that and suggest running a planner session first.
- If the user already specified a bead id, skip the selection step but still show details before claiming.
- When an `executor-*` orchestrator skill is driving the flow, it is valid to claim without confirmation when bead choice is unambiguous.
- Do not start coding before claiming. The bead must be `in_progress` before any implementation.
