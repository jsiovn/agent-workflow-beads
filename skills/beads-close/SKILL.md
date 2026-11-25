---
name: beads-close
description: 'Use after implementation, verification and code review are complete to record the closeout note, close the bead and create follow-up or lesson beads. This is the final step of a manual executor session.'
---

# Beads Close

**Workflow position:** Manual executor session, step 8 of 8. Final step after verification and code review. See `BEADS_WORKFLOW.md`.

Record what happened, then close the current bead.

<HARD-GATE>
Before invoking this skill, the following must already be true:

- a bead was claimed at the start of this session
- implementation is complete
- verification has been run (`verification-before-completion`)
- code review has been run (`requesting-code-review`)
- the work is committed (`git status --porcelain` shows nothing of yours) and `build-and-test` passed after the last edit, review fixes included

Do not invoke this skill:

- in a planner session
- before verification
- to close beads you did not work on in this session
  </HARD-GATE>

## Steps

1. Write the closeout note with the file-writing tool to `<TMP>/<id>-closeout.md`. `<TMP>` is the session's scratch directory when the CLI provides one, else the OS temp directory; never a path inside the repo. Exactly these five fields:

   ```
   Outcome: <what changed>
   Verified: <each command from the last run and the result observed>
   Decisions: <choice — reason, one per line: every recorded decision, every refuted review finding; "none">
   Persisted: <commits, files, artifacts>
   Downstream: <what later beads can rely on>
   ```

   - `Verified:` lists the commands of the last passing `build-and-test` / `verification-before-completion` run, as run, with what was observed (exit code, counts, response). Never "tests pass".
   - `Decisions:` collects every `Decision:` line already in the bead's notes (`bd show <id> --json`) and every review finding you refuted, with the reason.

2. Attach it from the file, never through shell quoting (commands and output contain backticks and `$`):

   ```bash
   bd note <id> --file <TMP>/<id>-closeout.md
   ```

3. Close the bead:

   ```bash
   bd close <id> --reason "Completed: <brief summary of what was done>"
   ```

4. Create follow-up beads if new work was discovered during implementation:

   ```bash
   bd create "Follow-up: ..." --description "Discovered during <id>: ..." --type task
   bd dep add <new-id> <other-id>
   ```

5. Create or extend a **lesson** bead when this session hit one of: a correction from the user, a convention that no written rule states, or a non-obvious command you had to discover.
   - First check for an existing one: `bd list --label lesson --json`. If one covers the same mistake class, append to it (`bd note <lesson-id> --file <TMP>/<id>-lesson.md`) instead of creating a duplicate.
   - Otherwise: `bd create "Lesson: <mistake class>" --type chore --priority 3 --labels lesson --body-file <TMP>/<id>-lesson.md`.
   - The body names the mistake class, the evidence (what happened, in which bead), and the highest enforcement that would prevent it, in this order of preference: structure (make it impossible) → types, lint or CI → a test → a `CLAUDE.md` rule (last resort).

In an epic run (the task prompt names an `epic/<id>` branch), follow-up and lesson beads never get `--parent` or a parent-child dependency on the epic: the driver executes every ready child of the epic, so a parented follow-up would run in the same unattended pass.

## Rules

- If execution was blocked and the bead is not complete, do not close it. Block it with the one safe form, which keeps the notes (the plan inlined there, earlier `Decision:` lines) intact:
  ```bash
  bd update <id> --status blocked --append-notes "Blocked: <one plain line: what stopped you and what would unblock it>"
  ```
  Never use the `--notes` flag on a bead that has notes: it replaces them. Commit what is done and leave it on the branch; the next session re-enters through `beads-claim` (_Re-entering a Bead_).
- When an `executor-*` orchestrator skill is driving the workflow, hand control back to it after the bead is closed.
- Work happens on feature branches. Merging to `main` is done via PR, not local merge.
- Live `.beads` state is local runtime. Do not treat it as something to publish through Git during normal closeout.
- Keep the closeout note concise but concrete. It should tell a fresh downstream session what changed, how it was proven, where the result lives, and what is now safe to assume. The PR step builds the PR body from it.
