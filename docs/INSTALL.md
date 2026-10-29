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

**macOS** — Homebrew:

```bash
brew install beads
```

or, on **macOS / Linux**:

```bash
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/steveyegge/beads/main/install.ps1 | iex
```

Verify:

```bash
bd version
```

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
agent-workflow-beads check       # confirms git, bd, dolt are on PATH
agent-workflow-beads --version
```

## 5. Bootstrap a repo

```bash
agent-workflow-beads bootstrap [--with-screenshots] [--with-opencode] /path/to/repo yourprefix
```

Bootstrap initializes git if needed, runs `bd init -p yourprefix --server --skip-agents --skip-hooks`,
installs the Claude integration, and scaffolds the shared workflow files (plus the OpenCode
implementor agent with `--with-opencode`; that option also needs `opencode` on `PATH`). For the full stage-1 then stage-2 adoption flow, see [SETUP-NEW-REPO.md](SETUP-NEW-REPO.md).
