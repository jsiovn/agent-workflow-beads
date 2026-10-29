<!-- BEGIN TEMPLATE BD WORKFLOW -->
## Workflow Guide

Use `BEADS_WORKFLOW.md` for the current planner and executor flow. All workflow skills are repo-local under `.claude/skills/` (OpenCode reads them from there too). Subagents dispatched by skills (e.g. `code-reviewer`) live under `.claude/agents/`. The optional OpenCode implementor agent lives under `.opencode/agents/` when OpenCode is set up.

Preferred entry points are `plan-beads`, `executor-task`, and `executor-task-worktree`. When the bead is part of an epic that should land in main as a single merge, use `executor-epic-task` (or `executor-epic-task-worktree` for parallel work) — these branch off and PR into `epic/<epic-bead-id>` instead of main. When a bead was already executed and a PR is open but the task turned out to be wrong, reopen the bead, edit its requirements, then run `executor-rework-in-place <bead-id>` to amend the existing PR in the current working tree (no new branch, no new PR). Use `planner-research` only inside a planner session when `brainstorming` still leaves material factual uncertainty. Every executor skill also accepts an optional `opencode` argument (e.g. `executor-task <bead-id> opencode`) that delegates only the implementation step to a headless OpenCode implementor (`.opencode/agents/implementor.md`, installed with `--with-opencode`) via `implement-with-opencode`; Claude still plans, tests, reviews, and closes the bead.

The executor test skill is installed at `.claude/skills/build-and-test/SKILL.md`; use it between implementation and final verification.

Workflow scaffold files such as `CLAUDE.md`, `BEADS_WORKFLOW.md`, and the `.claude` skills and agents are always committed to this repo's git — and the `.opencode/agents/` implementor is committed too when OpenCode is set up — so they travel with feature branches and `git worktree` checkouts. Refresh them from the template with `agent-workflow-beads update`. Plan files under `docs/plans/` are committed too: `writing-plans` commits each bead's plan on its branch, so plans travel with the branch and land in the PR. A plan is only visible from other branches once it merges; until then, inline it into the bead's `notes` (Dolt-synced) when another checkout needs it.

Keep repo exploration local. Verify the actual environment before running build, test, run, deploy, or migration commands; do not assume local execution.

## Issue Tracking With `bd`

- Use `bd` for all issue tracking
- Do not use markdown TODO files, TodoWrite, or alternate trackers
- Live `.beads` state is local-only and should not be committed
- Run one top-level executor session at a time per branch

## Essential Commands

```bash
bd ready --json
bd show <id> --json
bd create --title="Summary" --description="Details" --type=task|bug|feature|epic --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd dep add <child-id> <parent-id>
git checkout -b feat/<bead-id>
```

## Notes

- Epics must use `--type=epic`
- Check `bd ready` before asking what to work on next
- Each bead must be fresh-session-safe: a new executor session should be able to execute from the bead contract, persisted inputs, and local code inspection without replaying prior chat
- If the current checkout cannot open the Beads database, inspect `bd where` and run `bd bootstrap --yes` before continuing
<!-- END TEMPLATE BD WORKFLOW -->
