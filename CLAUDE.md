# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

This is a **template/scaffold repo**, not a deployed application. It produces and updates workflow files _in other (downstream) repos_. There is no build, no test suite, and no runtime service here — the "output" is files copied into downstream checkouts by the `agent-workflow-beads` CLI (`bin/cli.js` → `lib/`), which this repo publishes to npm as the `agent-workflow-beads` package.

Concretely: editing a file under `skills/`, `agents/`, or `templates/` only takes effect after running `agent-workflow-beads update` (or `agent-workflow-beads bootstrap` for a fresh repo) against a downstream repo and committing the refreshed files there. Nothing in this repo runs on its own.

## Mental Model: How Changes Propagate

Three surfaces get written into every downstream repo:

1. **Shared workflow skills** — one source in `skills/<name>/`, always copied into `<downstream>/.claude/skills/<name>/`. OpenCode reads skills straight from `.claude/skills/`, so there is no second copy.
2. **Shared agents** — one source in `agents/<name>.md`, always copied into `<downstream>/.claude/agents/<name>.md`. Claude-specific overrides can be placed in `templates/.claude/agents/` and are applied on top.
   - **OpenCode agents (opt-in)** — `templates/.opencode/agents/<name>.md` (OpenCode frontmatter: `mode`, `permission`; today only `implementor`, used by the `implement-with-opencode` skill), copied into `<downstream>/.opencode/agents/` only when OpenCode is enabled (`--with-opencode` on `bootstrap` / `update`, or auto-detected when the downstream already has `.opencode/agents/`). This is the entire OpenCode surface: OpenCode reads skills from `.claude/skills/` and falls back to `CLAUDE.md` when no `AGENTS.md` exists.
3. **Bootstrap-only / stage-1 skills** — sources in `templates/skills/<name>/`, always copied into `<downstream>/.claude/skills/<name>/`. The generic stage-1 `build-and-test` skill lives here and is the one file `agent-workflow-beads update` _preserves_ in the downstream if it already exists (downstream specialization). `attach-web-screenshots` also lives here but is opt-in — only installed when `agent-workflow-beads bootstrap` / `update` is invoked with `--with-screenshots`, or when the skill already exists in the downstream.
4. **Repo-root scaffolding** — `templates/BEADS_WORKFLOW.md`, `templates/PRIME.md`, `templates/.beads/*` (the downstream's `.beads/.gitignore` ships in the package as `templates/.beads/beads.gitignore` — npm refuses to pack a file basenamed `.gitignore` — and `lib/scaffold.js` writes it to the dotted name), and the managed snippets `templates/CLAUDE.snippet.md` (always merged into the downstream's `CLAUDE.md`) and `templates/AGENTS.snippet.md` (merged into the downstream's `AGENTS.md` only when one already exists — it is never created, but OpenCode prefers `AGENTS.md` over `CLAUDE.md`, so an existing one must carry the current block) — each injected between `<!-- BEGIN/END TEMPLATE BD WORKFLOW -->` markers by `lib/manageInstructions.js`. The template's own `scripts/` folder no longer exists — the scaffold logic is pure Node in `lib/`, run from the globally-installed CLI. The scaffold still actively removes helper scripts that *older* template versions shipped into downstreams (e.g. `scripts/shared/manage_instructions.py`) and prunes now-empty template script dirs there. (A downstream may keep its own `scripts/`; the template never touches those.)

`lib/scaffold.js` is the authority on exactly what gets copied and what gets deleted (e.g. removed legacy skills like `plan-debate`, `start-epic-worktree`, `swarm-epic`, `executor-once` via its `LEGACY_SKILLS` list, and stale downstream helper scripts via `LEGACY_SCRIPT_PATHS`). Read it before adding or renaming anything that ships downstream.

### Downstream Git tracks the workflow surface

The scaffolded workflow files (`CLAUDE.md`, `BEADS_WORKFLOW.md`, `.claude/`, and — only when OpenCode is enabled — `.opencode/agents/`) are **committed to each downstream repo's own git**, so they travel with feature branches and `git worktree` checkouts (the worktree executor flows depend on the skills and agents being present in a fresh checkout). The downstream's `.gitignore` managed block — written by `lib/manageGitignore.js` between the `# BEGIN/END TEMPLATE AGENT WORKFLOW LOCAL-ONLY` markers — lists only the machine-local runtime artifacts (`.beads-credential-key`, `.beads/interactions.jsonl`, `.bv/`, `.dolt/`, `*.db`, …). Plans under `docs/plans/` are committed like the rest: `writing-plans` commits each bead's plan on its branch, so it travels with the branch and lands in the PR (older template versions git-ignored `docs/plans/`; the next `update` drops that entry from the managed block). Any change you make here propagates in one round-trip: edit here → publish (or `npm link`) the CLI → `agent-workflow-beads update` in the downstream → commit the refreshed files there. (There is no longer a sibling backup-mirror repo; that machinery has been retired.)

## Primary Entry Points

All user-facing operations go through one cross-platform CLI (`bin/cli.js` → `lib/cli.js`), published to npm as `agent-workflow-beads` and installed globally as the `agent-workflow-beads` command. There are no longer POSIX/PowerShell script twins — the scaffold logic is a single Node implementation in `lib/`.

| Purpose                          | Command                                                              |
| -------------------------------- | ------------------------------------------------------------------- |
| New downstream repo              | `agent-workflow-beads bootstrap [--with-screenshots] [--with-opencode] <repo> <prefix>` |
| Refresh shared workflow surface  | `agent-workflow-beads update [--with-screenshots] [--with-opencode] <repo>`  |
| Prereq check                     | `agent-workflow-beads check [--with-opencode]`                               |

Claude Code is the **primary** AI in every downstream repo — the `.claude/` surface is always scaffolded. OpenCode is an **opt-in implementor**: `.opencode/agents/` is only scaffolded with `--with-opencode` (or auto-detected), and executor skills hand it the implementation step only when invoked with the `opencode` argument. Codex support was removed in 1.2.0: `--with-codex` is accepted but ignored with a warning, and a downstream's existing `.codex/` is never read or written.

`bootstrap` (in `lib/commands/bootstrap.js`) delegates to `lib/scaffold.js` + `lib/ensureStage1Beads.js` (which creates the standalone stage-2 follow-up bead to specialize `build-and-test`, plus a matching bead for `attach-web-screenshots` only when that opt-in skill is installed). It runs `bd setup claude` only — never `bd setup opencode`, whose `AGENTS.md` section would shadow `CLAUDE.md` for OpenCode. `update` (in `lib/commands/update.js`) re-runs scaffold on an existing repo. Both accept `--with-screenshots` to install the `attach-web-screenshots` skill and its companion `cleanup-screenshots.yml` CI workflow, and `--with-opencode` to scaffold the opt-in OpenCode implementor agent.

### Local development (this machine)

The CLI resolves its bundled assets relative to its own location (`lib/paths.js`: `ASSET_ROOT = path.resolve(__dirname, '..')`), so it works regardless of cwd. To run in-progress changes against a downstream without publishing, `npm link` from this checkout (puts the `agent-workflow-beads` bin on `PATH` pointing at the working tree), then use `agent-workflow-beads bootstrap <repo> <prefix>` / `agent-workflow-beads update <repo>` as normal.

## Two-Stage Adoption

- **Stage 1** (bootstrap) — generic `build-and-test` that executes each plan's literal `## Verification` section. `lib/ensureStage1Beads.js` creates standalone stage-2 follow-up beads exactly once so they survive re-runs.
- **Stage 2** (specialization, done in the downstream) — specialize the downstream's `build-and-test` skill and add repo-specific docs. `agent-workflow-beads update` preserves the downstream's customized `build-and-test`.

## Managed Snippet Invariants

`CLAUDE.snippet.md` is always injected into the downstream `CLAUDE.md`; `AGENTS.snippet.md` is injected into the downstream `AGENTS.md` only when an `AGENTS.md` already exists. Each is injected between `<!-- BEGIN TEMPLATE BD WORKFLOW -->` and `<!-- END TEMPLATE BD WORKFLOW -->`. `lib/manageInstructions.js` replaces only the block between those markers — **do not remove or rename the markers** or it will append a duplicate block on the next `agent-workflow-beads update`. That module also carries verbatim `LEGACY_BLOCKS`/`LEGACY_SNIPPETS` definitions that scrub blocks from older template versions; keep them byte-exact.

## Verifying Changes

When adding or editing a skill, follow `docs/AUTHORING-SKILLS.md` — it covers the SKILL.md conventions, the subagent pressure-test, and the propagation checks before the round-trip below.

There is no test suite. To verify a change:

1. `npm link` from this checkout, then run the relevant command (`agent-workflow-beads bootstrap` or `agent-workflow-beads update`) against a scratch downstream repo.
2. Inspect what landed in the downstream (especially `.claude/skills/`, the `CLAUDE.md` managed block, and — when OpenCode is enabled — `.opencode/agents/implementor.md`; the `.gitignore` managed block should list only the runtime artifacts — not the skill/agent paths or `docs/plans/`).
3. Confirm the refreshed workflow files (skills, agents) show up as ordinary tracked files in `git status` — they are committed, not gitignored (and so is `docs/plans/`).
4. If the change touches a shared skill, also verify the `.claude/` copy is correct.
5. If the change touches packaging or a shipped data path, run `npm pack --dry-run` and confirm the file list includes every asset the scaffold reads (and excludes `scripts/`, repo-only docs, and any file basenamed `.gitignore`).

Because the workflow surface is committed to the downstream's own git, a fresh clone already carries it; run `agent-workflow-beads update` against the clone to pull the latest template versions.

## Conventions

- The scaffold logic is pure Node in `lib/` with **zero runtime dependencies** (only `node:fs/path/child_process/os`) — there are no POSIX/PowerShell twins to keep in sync, and no Python. External tools `git`, `bd`, `dolt` are invoked via `lib/proc.js` (`spawnSync`, `shell:false`, full path resolved through `lib/which.js` so Windows `.cmd`/`.exe` resolve).
- The three Node ports (`lib/manageInstructions.js`, `lib/manageGitignore.js`, `lib/ensureStage1Beads.js`) must stay byte-for-byte faithful to the managed-block / gitignore / bead-title semantics — a one-byte drift breaks idempotency on already-scaffolded downstreams.
- `package.json`'s `files` allowlist governs what ships in the npm package. New shipped data must live under an allowlisted dir (`bin/ lib/ skills/ agents/ templates/`) or be added to the list; verify with `npm pack --dry-run`. Never ship a file basenamed `.gitignore` (npm drops it) — store it under a non-dot name and map it on copy, as done for `templates/.beads/beads.gitignore`.
- `.beads/` is git-ignored here as well — this template repo is not itself managed by `bd`.
- Beads is local-only: never add workflow to publish or sync live `.beads/` state across clones.
- When removing a skill from the template, also add its name to the `LEGACY_SKILLS` list in `lib/scaffold.js` so existing downstreams get it deleted on their next `agent-workflow-beads update` — the copy loop only iterates skills that still exist in the template, so a deleted source is never cleaned up otherwise.
- When adding a new skill under `skills/`, `lib/scaffold.js` picks it up automatically (it iterates every dir in `skills/`) and copies it into `.claude/skills/`. No `.gitignore` bookkeeping is needed: the workflow surface is committed downstream, and `lib/manageGitignore.js` ignores only machine-local runtime artifacts.
