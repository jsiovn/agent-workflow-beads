# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
