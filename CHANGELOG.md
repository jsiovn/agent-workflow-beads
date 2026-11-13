# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-11-13

The whole-epic executors pick their per-bead worker themselves, and the
OpenCode implementor is gone. Inside Herdr, every bead runs in an agent you
start in a tab the run creates; outside Herdr, a headless run of the CLI you
invoked the skill from. Claude Code, OpenCode and omp are all supported as the
driver and as the worker.

### Added

- `executor-epic-sequential` and `executor-epic-sequential-worktree` pick
  `<RUNNER>` in preflight from the environment, with a Node one-liner that works
  in any shell: `HERDR_ENV=1` → `run-bead-in-herdr`; otherwise
  `run-bead-headless-claude`, `-opencode` or `-omp` by `OMPCODE` / `OPENCODE`
  (omp also sets `CLAUDECODE`, so `OMPCODE` is read first). The skills take only
  the epic id.
- Three runner skills, one bead each, no loop logic:
  `run-bead-headless-claude` (`claude -p`, Opus 5.5 at high effort,
  `--dangerously-skip-permissions`, as before), `run-bead-headless-opencode`
  (`opencode run --standalone --yolo` from the checkout, stdin closed,
  OpenCode's default model) and `run-bead-headless-omp` (`omp -p --yolo`, stdin
  closed, omp's default model). Each states how its own driver waits for an
  hour-long worker and reads only the last `RESULT:` line.
- Epic preflight: a POSIX-shell gate (`timeout` must return 124; OpenCode on
  Windows runs PowerShell unless its `shell` key points at Git Bash) and a
  first-bead guard (the first bead still `open` after its worker stops the run
  without blocking the bead: the runner is broken, not the bead).
- `requesting-code-review` falls back to the CLI's general subagent, told to read
  `.claude/agents/code-reviewer.md` first, when there is no `code-reviewer`
  agent type (OpenCode, omp).
- `cleanup-worktree`: if removal fails because the directory is in use, close the
  Herdr tab whose cwd is the worktree and retry.
- Docs: how to invoke a skill per CLI (`/name` in Claude Code, `/skill:name` in
  omp, by name in OpenCode) and the OpenCode `"shell"` setting for Windows.

### Changed

- `run-bead-in-herdr` is rewritten around one flow. Once per run it creates (or
  reuses) the tab `<epic-id>-implementer` with the checkout or worktree as cwd,
  asks the user to start Claude Code, OpenCode or omp there and to reply `done`,
  then checks the agent's kind, status and cwd. Per bead it always clears the
  agent with its kind's command (`/clear` for Claude Code, `/new` for OpenCode
  and omp), sends the prompt from a file, confirms a new session id once the
  turn is `working` (OpenCode reports it only then), waits in 9-minute chunks,
  and on timeout sends the kind's interrupt keys (`esc`, or `esc esc` for
  OpenCode, whose `ctrl+c` quits). The tab is left open at the end. Clear
  commands, session timing and interrupt keys were observed live with Herdr
  0.9.5, Claude Code 2.1, OpenCode 2.2.6 and omp 18.18.8.
- The shared task prompt says where skills live (`.claude/skills/<name>/SKILL.md`)
  and that nobody is watching (never ask, no background work), for every runner.
- `writing-plans` proceeds without confirmation when invoked by any executor
  skill or epic worker prompt.

### Removed

- The OpenCode implementor: the `implement-with-opencode` skill (added to
  `LEGACY_SKILLS`, so `update` deletes it downstream), `templates/.opencode/`,
  and the `opencode` argument of all seven executor skills. `--with-opencode` is
  accepted but ignored with a warning. On `update`, a downstream's
  `.opencode/agents/implementor.md` is deleted only when it still contains the
  template marker; `.opencode/agents/` and `.opencode/` go only if empty.
- The epic skills' `herdr` / `herdr=<agent>` / `--runner` arguments, the
  user-named Herdr agent (`implementer`), `herdr agent start`, the worktree
  variant's closing of its tab, and the 5400 s implementor timeout.

### Migration

- Run `agent-workflow-beads update <repo>` and commit the result: four
  `run-bead-*` skills appear, `implement-with-opencode` and the scaffolded
  `.opencode/agents/implementor.md` disappear.
- Drop `opencode` / `herdr` from epic invocations; they are ignored. To have
  OpenCode or omp implement the beads, start it in the Herdr worker tab, or run
  the epic skill from it outside Herdr.
- On Windows, set `"shell"` in `opencode.json` to Git Bash before driving an
  epic from OpenCode.

## [1.2.0] - 2026-10-29

OpenCode replaces Codex as the optional second AI — as a headless implementor
that executor skills hand the coding step to, while Claude Code keeps every
other step of the cycle.

### Added

- `--with-opencode` on `bootstrap` / `update` / `check`: scaffolds
  `.opencode/agents/implementor.md` (OpenCode frontmatter; allowlist
  permissions — every tool denied, built-ins re-allowed, so MCP/plugin tools
  cannot bypass the shell rules — plus explicit denies for branch switches,
  pushes, `gh`, and `bd` writes). Auto-detected on later runs
  once `.opencode/agents/` exists. `check --with-opencode` warns when
  `opencode` is not on `PATH`.
- New shared skill `implement-with-opencode`: runs an executor's implementation
  step as `opencode run --standalone --agent implementor --auto`, judges each
  round from git (branch unchanged, new commits, clean tree), and routes
  build/test failures and Critical/Important review findings back as fix rounds
  (≤3 per bead).
- All seven executor skills accept an optional `opencode` argument
  (`--implementor opencode` / `implementor=opencode`, optional
  `model=<provider/model[#variant]>`). The epic-sequential pair passes it to
  each `claude -p` worker and raises the worker timeout to 5400s in that mode.

### Removed

- Codex support: the `.codex/` skill and agent surface, `bd setup codex`, the
  `skills/*/agents/openai.yaml` metadata, and Codex notes across skills, docs,
  and templates. `--with-codex` is still accepted but ignored with a warning; a
  downstream's existing `.codex/` directory is left untouched.

### Changed

- `AGENTS.md` is no longer created; an existing one still gets its managed
  block refreshed (OpenCode prefers `AGENTS.md` over `CLAUDE.md`).
- `docs/plans/` is no longer git-ignored: the managed `.gitignore` block drops
  it on the next `update`, and `writing-plans` now commits each bead's plan on
  its branch (`docs(plan): <bead-id> …`) so plans travel with the branch and
  land in the PR. Planner-time plans are still inlined into bead notes until
  they reach the default branch.
- Stage-1 follow-up bead text no longer has Codex variants; titles and the
  Claude-only text are unchanged, so existing beads still dedupe.

## [1.1.2] - 2026-10-01

Patch release moving the epic executors' headless workers to Claude Opus 5.5.

### Changed

- `executor-epic-sequential` and `executor-epic-sequential-worktree` now pin each
  headless `claude -p` worker to `--model claude-opus-5-5 --effort high`
  (previously `claude-opus-4-8` at `xhigh`). The invocation notes now say to
  raise effort to `xhigh` or `max` for harder epics.

## [1.1.1] - 2026-07-07

Patch release fixing an `agent-workflow-beads update` / `bootstrap` crash on
downstream repos with a large Beads backlog.

### Fixed

- `agent-workflow-beads update` / `bootstrap` aborted with a misleading
  `bd list failed with status 1` on downstream repos whose backlog serialized to
  more than ~1 MiB of JSON. `runCapture` (`lib/proc.js`) invoked `spawnSync`
  without a `maxBuffer`, so Node's 1 MiB default tripped `ENOBUFS` on the
  `bd list --all --limit 0 --json` read that seeds and dedupes the stage-1
  follow-up beads — the final step of the scaffold. `spawnSync` now runs with a
  256 MiB buffer, far above any realistic command output while still bounding a
  runaway process.

### Changed

- Point the README `bdtui` screenshot at the current `bdtui-jul-03.png` asset.

## [1.1.0] - 2026-06-29

Worktree-lifecycle release: deliver a whole epic unattended without touching the
main checkout, refresh epic branches with `rebase-and-push`, and bulk-tear-down the
worktrees the executor flows leave behind.

### Added

- `executor-epic-sequential-worktree` skill — runs every ready child bead of one
  epic sequentially in a fresh sibling git worktree checked out on the epic branch
  (`epic/<epic-bead-id>`), so the main working tree is never touched. Each bead runs
  in its own fresh headless `claude -p` session (clean context per task), commits
  directly onto the single epic branch, blocked beads are skipped, and the run ends
  with one PR (`epic → default`) and the worktree left in place for follow-up. The
  worktree-isolated companion to `executor-epic-sequential`.

### Changed

- `rebase-and-push` now also rebases an **epic branch** onto the default branch
  (previously it hard-refused on `epic/*`). It still refuses the default branch, and
  guards the shared-base case with a fail-closed check: if any open child PR still
  targets the epic branch, it stops and asks rather than rewriting the base those PRs
  are stacked on.
- `prune-local-branches` now tears down the sibling worktree attached to a `[gone]`
  branch before deleting it (the bulk counterpart to `cleanup-worktree`). It detects
  gone branches via `git for-each-ref` plumbing (not `git branch -vv | grep`),
  protects the main and current worktrees, and default-skips dirty/locked/unknown
  worktrees.
- `cleanup-worktree` recognizes worktrees created by
  `executor-epic-sequential-worktree` and `create-new-worktree`, and points to
  `prune-local-branches` for bulk teardown.
- The four `executor-epic-*` skills note that the epic branch is refreshed out of
  band with the user-invoked `rebase-and-push` skill.
- Propagated the new skill across `docs/SKILLS_RELATIONSHIPS.md`,
  `templates/BEADS_WORKFLOW.md`, `templates/PRIME.md`,
  `templates/CLAUDE.snippet.md`, and `README.md`.

### Fixed

- `package-lock.json` `bin` entry corrected from `agent-workflow` to
  `agent-workflow-beads`, matching the package rename in 1.0.0.

## [1.0.0] - 2026-06-29

First npm release. The scaffolder is now a single cross-platform Node CLI —
`agent-workflow-beads` — installed with `npm install -g`. No more cloning the
template to a stable path, maintaining shell aliases, or running per-OS scripts.

### Added

- `agent-workflow-beads` CLI with `bootstrap`, `update`, and `check` subcommands
  (`bin/cli.js`, `lib/`). Same command on macOS, Linux, and Windows.
- `npm install -g agent-workflow-beads` as the single install path. Bundled assets
  (`skills/`, `agents/`, `templates/`) ship via the `package.json` `files` allowlist
  and resolve relative to the install location, independent of the working directory.
- Consolidated `docs/INSTALL.md` covering Node.js, `bd`, `dolt`, and the CLI.
- Bootstrap drives `bd` non-interactively (`--non-interactive` + `BD_NON_INTERACTIVE`):
  init defaults to the maintainer role ("N" to "Contributing to someone else's repo?"),
  Beads auto-export is disabled so state stays local-only (code moves through git, not
  `.beads/issues.jsonl`), and bootstrap prints optional GitHub-backed Dolt-remote setup
  guidance for cross-machine sync.
- After bootstrap, prints next-step guidance to review and commit the scaffolded
  workflow files (`git add -A && git commit`) — `bd init` commits its own `.beads/`
  scaffolding, but the rest of the workflow surface is left for the developer to commit.

### Changed

- Ported all scaffolding logic from the POSIX/PowerShell scripts and Python helpers
  to pure Node with **zero runtime dependencies** (`lib/scaffold.js`,
  `lib/manageInstructions.js`, `lib/manageGitignore.js`, `lib/ensureStage1Beads.js`,
  `lib/prereqs.js`, `lib/proc.js`, `lib/which.js`, `lib/fsx.js`). Behavior toward
  downstream repos is unchanged — managed-block, `.gitignore`, and bead semantics are
  byte-for-byte identical to the previous implementation.
- The managed `.gitignore` writer (`lib/manageGitignore.js`) strips the orphaned
  `# Beads / Dolt files (added by bd init)` header that `bd init` leaves behind — its
  entries (`.dolt/`, `*.db`, …) are already covered by the managed block.
- `templates/.beads/.gitignore` is stored in-package as `templates/.beads/beads.gitignore`
  (npm refuses to pack a file basenamed `.gitignore`) and written to the dotted name on scaffold.
- Rewrote `README.md` and the docs for the npm install flow; dropped the
  clone/alias/Python instructions.
- `docs/TROUBLESHOOTING.md` is no longer scaffolded into downstream repos — it is
  a maintainer/bd-tooling doc, and copying it overwrote a project's own
  `docs/TROUBLESHOOTING.md`. The `bd bootstrap --yes` repair tip it carried is
  already documented in the shipped `BEADS_WORKFLOW.md`.

### Removed

- `scripts/posix/`, `scripts/windows/`, `scripts/shared/` — logic now lives in `lib/`.
- Per-OS install guides `docs/INSTALL-MACOS.md`, `docs/INSTALL-UBUNTU.md`,
  `docs/INSTALL-WINDOWS.md` (collapsed into `docs/INSTALL.md`).
- The `python3` prerequisite.

### Requirements

- Node.js >= 18; `git`, `bd`, and `dolt` on `PATH`.

[1.1.2]: https://github.com/jsiovn/agent-workflow-beads/releases/tag/v1.1.2
[1.1.1]: https://github.com/jsiovn/agent-workflow-beads/releases/tag/v1.1.1
[1.1.0]: https://github.com/jsiovn/agent-workflow-beads/releases/tag/v1.1.0
[1.0.0]: https://github.com/jsiovn/agent-workflow-beads/releases/tag/v1.0.0
