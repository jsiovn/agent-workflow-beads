<!-- BEGIN TEMPLATE BD WORKFLOW -->
## Workflow Guide

Use `BEADS_WORKFLOW.md` for the current planner and executor flow. All workflow skills are repo-local under `.claude/skills/` (OpenCode reads them from there too). Subagents dispatched by skills (e.g. `code-reviewer`) live under `.claude/agents/`. OpenCode and omp read the skills from `.claude/skills/` but not the agents; `requesting-code-review` then has a general subagent read `.claude/agents/code-reviewer.md`.

Preferred entry points are `plan-beads`, `executor-task`, and `executor-task-worktree`. When the bead is part of an epic that should land in main as a single merge, use `executor-epic-task` (or `executor-epic-task-worktree` for parallel work) — these branch off and PR into `epic/<epic-bead-id>` instead of main. When a bead was already executed and a PR is open but the task turned out to be wrong, reopen the bead, edit its requirements, then run `executor-rework-in-place <bead-id>` to amend the existing PR in the current working tree (no new branch, no new PR). Use `planner-research` only inside a planner session when `brainstorming` still leaves material factual uncertainty. To deliver a whole epic unattended on a single branch, use `executor-epic-sequential <epic-id>` (or `executor-epic-sequential-worktree <epic-id>` to keep the main checkout untouched) — it runs every ready child bead in turn, each in a fresh worker session that the skill picks itself (inside Herdr: an agent you start in the tab `<epic-id>-implementer` when the run asks, cleared before every bead, via `run-bead-in-herdr`; outside Herdr: a headless run of the CLI you invoked it from, `claude -p`, `opencode run` or `omp -p`, via `run-bead-headless-claude`, `-opencode` or `-omp`), commits them onto one `epic/<epic-bead-id>` branch, skips any bead that blocks, and opens one PR at the end. Invoke a skill with `/<name>` in Claude Code, `/skill:<name>` in omp, or by naming it in OpenCode. The epic skills need a POSIX shell: OpenCode on Windows runs PowerShell unless `"shell"` in `opencode.json` points at Git Bash.

The executor test skill is installed at `.claude/skills/build-and-test/SKILL.md`; use it between implementation and final verification.

Workflow scaffold files such as `CLAUDE.md`, `BEADS_WORKFLOW.md`, and the `.claude` skills and agents are always committed to this repo's git — so they travel with feature branches and `git worktree` checkouts. Refresh them from the template with `agent-workflow-beads update`. Plan files under `docs/plans/` are committed too: `writing-plans` commits each bead's plan on its branch, so plans travel with the branch and land in the PR. A plan is only visible from other branches once it merges; until then, inline it into the bead's `notes` (Dolt-synced) when another checkout needs it.

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
