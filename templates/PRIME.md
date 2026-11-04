# Prime

> **Context Recovery**: start from `bd ready`, `bd list --status open`, `bd list --status in_progress`, and `bd show <id>`. Add `--json --brief` to `bd ready`/`bd list` when you only need ids and titles.

## Core Rules

- Default: use `bd` for all issue tracking
- Do not create parallel TODO lists, TodoWrite/TaskCreate lists, or markdown trackers
- Live `.beads` state is local-only and not meant for Git sharing
- Run one top-level executor session at a time per branch
- Planner sessions stay planner-only; executor sessions do implementation

## Useful Commands

```bash
bd ready
bd show <id>
bd update <id> --claim
bd close <id> --reason="Completed"
bd dep add <child-id> <parent-id>
git checkout -b feat/<bead-id>
```

## Workflow Pointers

- `plan-beads` handles discuss -> optional research -> bead creation -> validation
- `executor-task` is the standard one-bead-per-PR executor (fresh `feat/<bead-id>` branch off main, PR into main)
- `executor-task-worktree` is the same flow inside an isolated git worktree, for parallel work
- `executor-epic-task` branches off the bead's parent epic branch (`epic/<epic-bead-id>`) and PRs into it instead of main; auto-creates the epic branch from the default branch if it does not exist
- `executor-epic-task-worktree` is the epic flow inside an isolated git worktree (never touches the main checkout)
- `executor-epic-sequential <epic-id>` delivers a **whole epic** unattended: it creates `epic/<epic-bead-id>` once, then runs every ready child bead in turn — each in a fresh headless `claude -p` session so context never carries between tasks — committing them onto that one branch, skipping any bead that blocks, and opening a single PR to the default branch at the end (relies on fresh-session-safe beads)
- `executor-epic-sequential-worktree <epic-id>` is the same whole-epic flow, but it runs inside a sibling git worktree (`../<repo>-epic-<epic-bead-id>`) and never touches the main checkout — use it when the main tree has in-flight work; it leaves the worktree in place for the PR's review/CI follow-up (`cleanup-worktree` removes it later)
- `executor-rework-in-place` re-executes a reopened bead on the **current** feature branch and pushes more commits into its **existing** open PR (no new branch, no new PR); use after `bd reopen <id>` when the task was wrong
- Each bead must be fresh-session-safe: rely on the bead contract, persisted inputs, and local inspection rather than prior chat memory

## Recovery

- If the current checkout cannot see the Beads database, inspect `bd where`
- If local server state looks wrong, use `bd bootstrap --yes`
