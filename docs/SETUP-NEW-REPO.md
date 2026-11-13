# New Repo Setup Guide

Use this guide when starting a downstream repo from scratch or when a repo is still too empty to support project-specific workflow customization.

## Stage 1: General Bootstrap

1. Ensure machine prerequisites exist:
   - Node.js ≥18 (to install/run the `agent-workflow-beads` CLI: `npm install -g agent-workflow-beads`)
   - `bd`
   - `dolt`
   - `git`
2. Bootstrap the repo from this template:
   - `agent-workflow-beads bootstrap [--with-screenshots] [--with-web] [--with-omp] [--with-opencode] /path/to/repo <prefix>`
   - The same command works on macOS, Linux, and Windows.
   - Pass `--with-screenshots` only for web/UI projects that want the `attach-web-screenshots` skill plus its companion `.github/workflows/cleanup-screenshots.yml`. Omit for backend, CLI, or library repos.
   - Pass `--with-web` only for web/UI projects that want the `responsive-layout-testing` and `prepare-android-chrome` skills. A later `update` keeps them current without the flag.
   - Claude Code is the primary AI: the `.claude/` surface is always installed. OpenCode and omp read the same `.claude/skills/` but not `.claude/agents/`: pass `--with-opencode` and/or `--with-omp` to also install the shared agents converted for those CLIs (`.opencode/agents/<name>.md`, `.omp/agents/<name>.md`, each marked as generated; a later `update` keeps them current without the flag). Without the flags, skills that dispatch an agent fall back to a general subagent reading `.claude/agents/<name>.md` (on Windows, set OpenCode's `"shell"` to Git Bash before running the epic skills from it; see [INSTALL.md](INSTALL.md)).
3. The bootstrap script:
   - initializes git if the target path is not already a repo
   - runs `bd init -p <prefix> --server --skip-agents --skip-hooks`
   - runs `bd setup claude` (never `bd setup opencode` — its `AGENTS.md` section would shadow `CLAUDE.md` for OpenCode)
   - scaffolds the shared workflow docs and skills into `.claude/`
   - installs the managed root `.gitignore` block for local runtime artifacts (Beads/Dolt state, `*.db`, etc.); plans under `docs/plans/` are committed per bead by `writing-plans`
   - creates a standalone stage-2 bead for specializing `build-and-test`, plus a matching bead for `attach-web-screenshots` only when that opt-in skill was installed
4. Verify the repo is ready:
   - `bd where`
   - `bd ready --json`

## First Work In An Empty Repo

You do not need project-specific skills yet.

1. Run a planner session:
   - `plan-beads`
   - `brainstorming`
   - `planner-research` only if facts still matter
   - confirm the settled plan for Beads creation
   - `beads-planner`
   - `validate-beads`
2. Let the first planning pass define the runtime shape, likely files, verification needs, and the persisted inputs later beads should rely on.
3. Make sure the bead contract includes `Read:`, `Inputs:`, `Files:`, and `Verify:` so a fresh executor session can execute without replaying planner chat.
4. Make sure early execution plans include a precise `## Verification` section with exact commands and expected evidence. The stage-1 `build-and-test` skill depends on that section and will not guess.
5. Keep the bootstrap-created `Specialize build-and-test for this repo` bead independent (and `Specialize attach-web-screenshots for this repo` if you opted into screenshots). Do not make them children of the first feature epic.

## Stage 2: Project-Specific Customization

Customize the repo only after the real workflow becomes obvious from the first plan, first beads, or first implementation cycle.

Typical stage-2 changes:

- specialize `.claude/skills/build-and-test/SKILL.md`
- (if installed) specialize `.claude/skills/attach-web-screenshots/SKILL.md`
- add runtime-specific setup or operational notes
- add repo-specific guidance outside the managed blocks in `CLAUDE.md` (and `AGENTS.md` if the repo keeps one)
- run `agent-workflow-beads update <repo>` to refresh shared workflow docs and skills from the template — they are committed to the downstream's own git and travel with feature branches

Examples:

- web app: `npm run build`, `npm run preview`, HTTP smoke checks, browser inspection
- backend service: package build, process launch, API health checks
- device viewer: serve the app, connect to a live device or image, confirm the UI renders the session correctly

## Ongoing Maintenance

- edit shared workflow skills in this template repo, publish a new CLI version, then run `agent-workflow-beads update <repo>` for downstream repos
- the scaffolded workflow docs and skills are committed to the downstream repo's own git (no backup mirror)
- keep repo-specific `build-and-test` customizations local to the downstream repo
- if template changes should not overwrite a downstream specialization, rely on the existing scaffold behavior that preserves `build-and-test`
