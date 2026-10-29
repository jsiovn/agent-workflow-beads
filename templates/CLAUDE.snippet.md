<!-- BEGIN TEMPLATE BD WORKFLOW -->

### PR review replies

Only append `@claude review` when posting a reply to a **conversation comment authored by `claude[bot]`**. This triggers the bot to re-run its review.

Do **not** include `@claude review` in replies to human reviewer inline thread comments or in any other conversation comments.

## Issue tracking

This repo uses `bd` for issue tracking. Use `bd`, not markdown TODO files or alternate trackers.

Live `.beads` state is local-only and should not be committed. Use one top-level executor session at a time per branch.

Preferred workflow entry points are `plan-beads`, `executor-task`, and `executor-task-worktree`. When the bead is part of an epic that should land in main as a single merge, use `executor-epic-task` (or `executor-epic-task-worktree` for parallel work) — these branch off and PR into `epic/<epic-bead-id>` instead of main. To deliver a whole epic unattended on a single branch, use `executor-epic-sequential <epic-id>` — it runs every ready child bead in turn, each in a fresh headless `claude -p` session (clean context per task), commits them onto one `epic/<epic-bead-id>` branch, skips any bead that blocks, and opens one PR to the default branch at the end; use `executor-epic-sequential-worktree <epic-id>` for the same whole-epic run inside an isolated git worktree that never touches the main checkout (then `cleanup-worktree` to remove it). When a bead was already executed and a PR is open but the task turned out to be wrong, reopen the bead, edit its requirements, then run `executor-rework-in-place <bead-id>` to amend the existing PR in the current working tree (no new branch, no new PR). Use `planner-research` only inside planner sessions and keep `writing-plans` executor-only. Every executor skill also accepts an optional `opencode` argument (e.g. `executor-task <bead-id> opencode`) that delegates only the implementation step to a headless OpenCode implementor (`.opencode/agents/implementor.md`, installed with `--with-opencode`) via `implement-with-opencode`; Claude still plans, tests, reviews, and closes the bead.

Each bead must be fresh-session-safe: a new executor session should be able to execute from the bead contract, persisted inputs, and local code inspection without replaying prior chat.

Workflow scaffold files such as `CLAUDE.md`, `BEADS_WORKFLOW.md`, repo-local skills under `.claude/skills/`, and repo-local subagents under `.claude/agents/` are committed to this repo's git — and the OpenCode implementor agent under `.opencode/agents/` is committed too when OpenCode is set up — so they travel with feature branches and `git worktree` checkouts. Refresh them from the template with `agent-workflow-beads update`. Plan files under `docs/plans/` are committed too: `writing-plans` commits each bead's plan on its branch, so plans travel with the branch and land in the PR. A plan is only visible from other branches once it merges; until then, inline it into the bead's `notes` (Dolt-synced) when another checkout needs it.

Keep repo exploration local. Verify the actual environment before running build, test, run, deploy, or migration commands; do not assume local execution.

Useful commands:

```bash
bd ready --json
bd show <id> --json
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd dep add <child-id> <parent-id>
```

<!-- END TEMPLATE BD WORKFLOW -->
