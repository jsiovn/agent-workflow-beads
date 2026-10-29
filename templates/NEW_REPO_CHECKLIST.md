# New Repo Checklist

## Stage 1: General Workflow Bootstrap

1. Install Node.js ≥18, `bd`, and `dolt` on the machine, then `npm install -g agent-workflow-beads`.
2. Bootstrap the repo with the CLI. If the target path is empty, it initializes git first.
   - `agent-workflow-beads bootstrap [--with-opencode] /path/to/repo <prefix>` (same command on macOS, Linux, and Windows)
   - Claude Code is the primary AI and `.claude/` is always installed; pass `--with-opencode` to also install the OpenCode implementor agent (`.opencode/agents/implementor.md`) so executors can delegate implementation with the `opencode` argument.
3. Verify:
   - `bd version`
   - `bd ready --json`
   - `bd where`
4. Confirm the standalone bootstrap beads exist:
   - `Specialize build-and-test for this repo`
   - `Specialize attach-web-screenshots for this repo`
5. Use the general planner flow immediately, even in an empty repo:
   - `plan-beads`
   - `brainstorming`
   - `planner-research` if needed
   - `beads-planner`
   - `validate-beads`
6. Ensure beads include `Read:`, `Inputs:`, `Files:`, and `Verify:` so a new executor session can execute them without replaying planner chat.
7. Keep the bootstrap-created build-and-test bead independent; do not nest it under the first feature epic.
8. Ensure the first execution plans include an exact `## Verification` section because the stage-1 `build-and-test` skill is generic and follows the plan literally.

## Stage 2: Project-Specific Specialization

1. Customize the repo-local `build-and-test` skill once the repeated verification flow is clear (`.claude/skills/build-and-test/SKILL.md`).
2. Customize the repo-local `attach-web-screenshots` skill with the project's preview command and auth shape.
3. Add repo-specific setup docs only when there is stable runtime, build, serve, deploy, or smoke-test behavior worth documenting.
4. Keep the general workflow skills synced from this template; only the repo-local specializations should diverge.
5. Run one top-level executor session at a time per branch. Use `executor-task-worktree` (or `executor-epic-task-worktree` when the work targets an epic branch) to parallelize across worktrees.
