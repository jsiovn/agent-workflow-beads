# Beads Workflow

This repo uses **`bd`** for task state and selected execution-quality skills for planning and delivery. Beads remains the source of truth for `epic`, `task`, `bug`, and `chore` state.

## Local-Only Beads Model

- The current checkout owns the live `.beads/` database.
- Live Beads state is local to this clone and is not shared through Git.
- Run one top-level executor session at a time per branch to avoid Git conflicts.

## Workflow Skills

Claude Code enters the workflow through repo-local skills installed under `.claude/skills/`:

- `plan-beads`
- `executor-task`
- `executor-task-worktree`
- `executor-epic-task`
- `executor-epic-task-worktree`
- `executor-epic-sequential`
- `executor-epic-sequential-worktree`
- `executor-rework-in-place`

When an executor skill stops on a blocker, continue in normal chat by telling the agent to resume the blocked bead.

## Planner Session

Turns a fuzzy idea into structured, claimable beads. No code is written.

1. `brainstorming` - clarify scope, options, and design direction
2. `planner-research` - only if material factual uncertainty remains
3. brief the settled recommendation and confirm Beads creation
4. `beads-planner` - translate the design into Beads epics, tasks, and dependencies
5. `validate-beads` - confirm the epic is fresh-session-safe

Entry: a feature idea, bug report, or project change.
Exit: beads created with dependencies, ready for `bd ready`.

Fresh-session-safe means each bead carries enough persisted context that a new executor session can execute it without replaying the prior planner chat.

## Executor Session

Claims one bead and delivers it.

1. `beads-claim`
2. `writing-plans`
3. implement
4. `systematic-debugging` if blocked
5. repo-local `build-and-test`
6. `verification-before-completion`
7. `requesting-code-review`
8. `beads-close`

Optional: pass `opencode` to any executor skill to have step 3 run as a headless OpenCode implementor (`implement-with-opencode`; needs `opencode` on `PATH` and `.opencode/agents/implementor.md` from `agent-workflow-beads update --with-opencode`). Build/test failures and Critical/Important review findings go back to the implementor as fix rounds; Claude keeps every other step.

Entry: a ready bead from `bd ready`.
Exit: bead closed, code committed, follow-up beads created if needed.

Pick the executor variant by base branch and isolation:

- **PR base = main, current checkout:** `executor-task`
- **PR base = main, isolated worktree (parallel-safe):** `executor-task-worktree`
- **PR base = the bead's parent epic branch (`epic/<epic-bead-id>`), current checkout:** `executor-epic-task`
- **PR base = epic branch, isolated worktree:** `executor-epic-task-worktree`

Use the `epic-*` variants when the whole epic should land in main as one merge and each child bead ships as its own PR into that epic branch. The epic variants resolve `<epic-bead-id>` from the task bead's parent epic; if the epic branch doesn't exist yet, they create it from the latest default branch.

To run an **entire epic unattended** on a single branch instead of one bead at a time:

- **Whole epic, one branch, one PR (current checkout):** `executor-epic-sequential`
- **Whole epic, one branch, one PR (isolated worktree, main tree untouched):** `executor-epic-sequential-worktree`

It creates `epic/<epic-bead-id>` once, then executes every ready child bead in turn — each in a **fresh headless `claude -p` session**, so context never carries between tasks — committing each directly onto that branch, and finishes with a single PR (`epic/<epic-bead-id>` → default branch). A bead that fails or blocks is marked blocked and skipped (its dependents are skipped too) and the run continues. Prereqs: the target must be an epic and the `claude` CLI must be on `PATH`. The flow relies on fresh-session-safe beads, so run `validate-beads` on the epic first. Unattended runs use `--dangerously-skip-permissions` by default (auto-approves the workers' tool calls); each worker is separate token usage.

`executor-epic-sequential` switches the **main checkout** onto the epic branch, so it requires a clean working tree (no auto-stash). `executor-epic-sequential-worktree` does the same run inside a **sibling git worktree** (`../<repo>-epic-<epic-bead-id>`) and never touches the main tree — use it when the main checkout has in-flight work that must stay undisturbed. It leaves the worktree in place for the PR's review comments and CI fixes; remove it with `cleanup-worktree` once the PR lands.

When a bead was already executed but the task itself turned out to be wrong:

- **Rework into the existing PR (no new branch, no new PR):** `executor-rework-in-place`

Use this after `bd reopen <bead-id>` and editing the bead's requirements. It stays on the current feature branch in the current working tree, re-runs the executor chain against the updated bead, pushes new commits into the existing open PR, and posts a top-level fixup comment naming the bead id and the new tip SHA. Requires `bead_id`; refuses to run on the default branch, on a dirty tree, or when the current branch has no open PR.

## Session Boundaries

- Planner sessions do not write code.
- Executor sessions do not re-plan the whole project.
- Do not run multiple top-level code-writing executor sessions on the same branch at the same time.

## Branch and PR Workflow

- Do code work on feature branches.
- Open pull requests instead of merging locally.
- Beads state itself is local-only; code moves through Git, not Beads exports.
- Workflow scaffold files are committed to this repo's git and travel with feature branches and `git worktree` checkouts.
- Plan files under `docs/plans/` are committed: `writing-plans` commits each bead's plan on its branch (`docs(plan): …`), so it travels with the branch and lands in the PR. A plan is only visible from other branches once it merges; until then, inline it into the bead's `notes` (Dolt-synced) when another checkout needs it.
- `finishing-a-development-branch` handles branch push and PR creation.

## Operational Notes

- Workflow docs and skills are committed and pushed as part of the normal git flow; refresh them from the template with `agent-workflow-beads update` when needed.
- If `bd where` or `bd context` fails in the current checkout, repair the repo with `bd bootstrap --yes` before continuing.
- Use `bd ready` before asking what to work on next.
