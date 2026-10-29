---
name: beads-planner
description: 'Break a discussed or settled problem into Beads epics and tasks with clear dependencies and validation work. Use when the user wants to turn a problem statement, planning discussion, or settled execution plan into a Beads structure instead of ad-hoc TODOs.'
---

# Beads Planner

**Workflow position:** Planner session, after `brainstorming` and any optional `planner-research`. When `plan-beads` invokes this skill, validation should happen immediately after bead creation in the same planner session. See `BEADS_WORKFLOW.md`.

Turn planning output into a Beads structure that another agent or engineer can execute directly.

## Use This Workflow

1. Confirm whether the conversation already produced a settled execution plan or whether `plan-beads` supplied a clear topic that still needs planning.
2. If no plan exists, create a lightweight execution plan first.
3. Translate the settled plan into Beads:
   - one `epic` for the main outcome; use `--type epic` so `bd` recognizes it as an epic and `bd ready --parent` works correctly
   - small executable `task` beads for implementation work
   - `bug` beads for concrete broken behavior
   - `chore` beads for tooling, cleanup, or maintenance work
   - parent all child beads under the epic with `--type parent-child`: `bd dep add <child-id> <epic-id> --type parent-child`. The default `blocks` dependency type is rejected when the target is an epic (`Error: tasks can only block other tasks, not epics`). For task-to-task ordering inside the epic, the default `blocks` type is correct — use it for those edges.
4. Add dependencies explicitly instead of relying on ordering in prose.
5. Include validation work as its own bead when it is meaningful:
   - tests
   - review
   - migration
   - docs
6. If the epic includes runtime logic changes, make the last bead an end-to-end `build-and-test` bead that depends on all implementation beads.
7. For any bead, encode this execution contract directly in the description or notes:
   - `Read:` exact files, docs, or code areas a fresh worker must inspect before editing
   - `Inputs:` persisted prerequisites only, such as upstream bead ids, committed code, generated artifacts, or bead notes that the worker must rely on
   - `Files:` exact file paths or directory scope the worker may touch
   - `Verify:` exact commands or checks required before success can be reported
   - `Risk:` `low`, `medium`, or `high`
   - `Parallel:` whether the bead can run in parallel and what it must not overlap with
   - `Escalate:` what to do if blocked, underspecified, or forced out of scope
8. Before creating beads, audit every `Read:` reference for portability across machines:
   - A `Read:` path is portable only if it is committed to git in the current repo. Anything else — `$HOME`, `~/.claude/`, `/tmp/`, paths outside the working tree, OR in-repo paths under a git-ignored directory — is **non-portable** and unreachable for teammates who sync via Dolt only.
   - **Check `docs/plans/` portability before relying on it.** Run `git check-ignore -v docs/plans/` once. If it is git-ignored (older scaffolds ignored it; current ones commit it), then `docs/plans/<slug>.md` is NOT a portable `Read:` target — the file won't reach teammates and the reference will mislead a fresh executor on another machine. The Dolt-synced bead `notes` field is the only cross-machine source of truth.
   - For each non-portable plan or spec file:
     1. **Always inline the plan content into the bead's `notes` field via `bd update --append-notes`** (see step 9 — the create-time flags are not reliable).
     2. Optionally copy the file into the repo at `docs/plans/<slug>.md` for in-repo browsing convenience. Create the directory if missing. **Do NOT cite this path in the bead's `Read:` section if `docs/plans/` is git-ignored** — point fresh executors at the bead's `notes` field instead, e.g. `- This bead's `notes`field (view with`bd show <bead-id>`) — full settled plan.`
     3. Even where `docs/plans/` is not ignored, a planner-copied `docs/plans/<slug>.md` is only portable once it is committed **and** reachable from the branch the executor will cut from (normally the default branch). A planner session does not commit, so inlining into notes stays the normal path. Cite `docs/plans/<slug>.md` directly in `Read:` only when that file is already committed on the default branch.
   - If the same plan file is referenced by many beads in the epic, inline it once per bead anyway — every bead must be fresh-session-safe on its own. (A reader pulling one bead from Dolt won't have the epic's notes loaded.)

9. **Inlining plan content into bead notes — use the verified pattern.** `bd create`'s `--notes` / `--append-notes` flags have been observed to silently drop the content at creation time. The reliable two-step pattern:

   ```bash
   # 1) Create the bead with --body-file for the description only
   bd create "title" --type task --priority 2 --body-file /tmp/bead-X.md --json

   # 2) Then attach the long-form plan to notes
   bd update <new-bead-id> --append-notes "$(cat docs/plans/<slug>.md)"
   ```

   After all beads are created and notes attached, verify in one command:

   ```bash
   for b in <id1> <id2> ...; do
     bd show "$b" --json | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(f'{d[\"id\"]}: notes={len(d.get(\"notes\") or \"\")}ch')"
   done
   ```

   Every bead expected to carry the plan must show non-zero `notes` length. If any is 0, re-run the `bd update --append-notes` for that bead. Do NOT report bead creation as complete until this verification passes.

10. **Push the Dolt remote after wiring is final.** Beads only reach teammates after `bd dolt push`. Run it once at the end of the planner session, after creation + dependency wiring + notes verification all pass.

## Planning Rules

- Use the settled plan directly if the session already produced one. Do not re-plan from scratch.
- Keep beads executable by one focused session whenever possible.
- Prefer a few clear beads over a large brainstorm list.
- Keep Beads as the source of truth for task state. Do not create parallel markdown task lists.
- Separate project-level planning from single-task execution plans. Detailed execution plans belong to the execution phase, not the bead decomposition phase.
- Each bead should be specific enough that a fresh executor session can start from the bead alone plus local code inspection.
- Treat "fresh-session-safe" as the target property. A bead may depend on earlier beads, but it must not depend on replaying the prior planner chat.
- Split any bead that spans multiple unrelated code areas, multiple independently testable outcomes, or a broad refactor that would likely force context compaction.
- If a later bead needs prior results, persist them in code, artifacts, or bead notes and reference them in `Inputs:` instead of assuming conversational memory.

## Output Shape

- State the proposed epic title when an epic is warranted.
- Group tasks by dependency order.
- Call out tasks that can proceed in parallel.
- Flag important assumptions or unresolved risks that should become beads or notes before execution starts.
- Say whether the resulting epic is ready for `validate-beads` or what still needs to be tightened first.

## Session Boundary - STOP HERE

<HARD-GATE>
This is a planner skill. After beads are created, the session is done.

Do not:

- claim or execute the beads you just created
- invoke `beads-claim`, `writing-plans`, `build-and-test`, or `beads-close`
- start coding or dispatch implementation subagents
- run `bd ready` and pick up work

Do:

- report the created beads and their dependency structure
- if this skill was invoked directly, tell the user: "Beads created. Run `validate-beads`, then claim one with `bd ready` in an executor session."
- if `plan-beads` invoked this skill, immediately hand back to `plan-beads` so it can run `validate-beads` before ending the planner session
  </HARD-GATE>
