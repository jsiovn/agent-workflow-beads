# Install

The `agent-workflow-beads` CLI is a single cross-platform Node package. Installing it is
the same on macOS, Linux, and Windows; only the two external tools it drives (`bd`
and `dolt`) have per-OS install steps.

## 1. Node.js ≥18

The CLI runs on Node and installs via `npm`. Get it from [nodejs.org](https://nodejs.org)
(or a version manager like `nvm`/`fnm`/`volta`). Verify:

```bash
node --version   # v18 or newer
npm --version
```

## 2. `bd` (Beads CLI)

The workflow skills need **`bd` 1.3.0 or newer** (they use `bd ready --brief` and
`bd update --claim`). `agent-workflow-beads check` prints the installed version and
warns when it is older.

**macOS** — Homebrew:

```bash
brew install beads
```

or, on **macOS / Linux**:

```bash
curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/gastownhall/beads/main/install.ps1 | iex
```

or, anywhere Node.js is installed:

```bash
npm install -g @beads/bd
```

Verify (expect `1.3.0` or newer):

```bash
bd version
```

Upgrading an existing install across the 1.3.x schema migrations has one-time steps;
see "Upgrading `bd` to 1.3.x" in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 3. `dolt`

`bd` stores issues in Dolt. Install Dolt for your OS (see the
[Dolt install docs](https://docs.dolthub.com/introduction/installation)) and verify:

```bash
dolt version
```

## 4. The CLI

```bash
npm install -g agent-workflow-beads
```

Verify everything is wired up:

```bash
agent-workflow-beads check       # confirms git, bd (and its version), dolt; reports rtk
agent-workflow-beads --version
```

## 5. Bootstrap a repo

```bash
agent-workflow-beads bootstrap [--with-screenshots] [--with-opencode] /path/to/repo yourprefix
```

Bootstrap initializes git if needed, runs `bd init -p yourprefix --server --skip-agents --skip-hooks`,
installs the Claude integration, and scaffolds the shared workflow files (plus the OpenCode
implementor agent with `--with-opencode`; that option also needs `opencode` on `PATH`). For the full stage-1 then stage-2 adoption flow, see [SETUP-NEW-REPO.md](SETUP-NEW-REPO.md).

## 6. Optional: rtk (smaller Bash output for Claude Code)

[rtk](https://github.com/rtk-ai/rtk) is a separate, per-machine tool that condenses
the output of shell commands (`git status`, `git log`, test runners, `ls`, …) before
Claude Code reads it, which cuts the tokens each Bash call costs. It works through a
global Claude Code `PreToolUse` hook, so it applies to every session on the machine,
including the headless `claude -p` workers of the `executor-epic-sequential*` skills.

The template never installs or configures rtk; `agent-workflow-beads check` only
reports whether it is installed and whether its hook is registered. To enable it:

```bash
brew install rtk                 # macOS / Linux
winget install rtk-ai.rtk        # Windows
rtk init -g --auto-patch         # register the hook in ~/.claude/settings.json
```

Then restart Claude Code. `rtk gain` shows the measured savings, and
`rtk init -g --opencode` installs the equivalent OpenCode plugin if you use the
OpenCode implementor.

Things to know:

- rtk only rewrites the **Bash** tool. Claude Code's built-in Read, Grep, and Glob are
  untouched.
- Commands rtk does not know, such as `bd`, run unchanged. Machine-readable forms the
  skills rely on (`gh … --json`, `git status --porcelain`, `git merge-base`,
  `bd … --json`) pass through unfiltered.
- If a condensed result is ever unusable, rerun that one command as
  `rtk bypass <cmd>`.
- Do not commit an rtk hook into a downstream repo's `.claude/settings.json`: every
  collaborator and CI session without rtk would get a failing hook on each Bash call.
- Licensing: the default `rtk` binary is Apache-2.0 plus BUSL-1.1 (free to use, not
  to resell as a service); the `rtk-oss` edition is Apache-2.0 only
  (`brew install rtk-ai/tap/rtk-oss`).
