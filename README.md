# Agent Workflow Beads

A scaffold that installs a consistent **planner → executor** workflow for **AI coding agents** into any repo — a shared set of skills, subagents, and [Beads](https://github.com/steveyegge/beads)-backed task tracking so that **Claude Code** (the primary AI) follows the same playbook in every project, with an optional headless **OpenCode** implementor that executors can hand the coding step to. You plan once, execute one bead per PR, and ship.

This repo runs nothing itself — it's developer tooling for AI coding agents, not a CI/CD or GitHub Actions "workflow." You install the `agent-workflow-beads` CLI once on your machine, then run one command per project to scaffold (or refresh) the workflow inside that project.

> **Inspired by** [obra/superpowers](https://github.com/obra/superpowers) — the execution-quality skills are curated copies adapted to a Beads-native flow — and [Beads](https://github.com/steveyegge/beads), which backs all task tracking. See [ATTRIBUTION.md](ATTRIBUTION.md).

---

## Preinstall

You need these machine-wide tools before bootstrapping any project:

| Tool       | What for                                  | Verify             |
| ---------- | ----------------------------------------- | ------------------ |
| Node.js ≥18 | Runs the `agent-workflow-beads` CLI (via `npm`) | `node --version`   |
| `bd`       | Beads CLI (issue tracking)                | `bd version`       |
| `dolt`     | Storage backend used by `bd`              | `dolt version`     |
| `opencode` | _Optional_ — only for the OpenCode implementor (`--with-opencode`) | `opencode --version` |

`git` is also required (you almost certainly already have it). Per-OS instructions for installing `bd` and `dolt` are in [docs/INSTALL.md](docs/INSTALL.md). The CLI itself is pure Node — there is no Python, bash, or PowerShell dependency, and it works the same on macOS, Linux, and Windows.

To verify the runtime tools are in place in one shot (after installing the CLI, below):

```bash
agent-workflow-beads check
```

---

## How to install

### 1. Install the CLI globally

```bash
npm install -g agent-workflow-beads
```

This puts a single cross-platform `agent-workflow-beads` command on your `PATH`. Upgrade later the same way you upgrade any global package (`npm install -g agent-workflow-beads@latest`); there is no checkout to keep in sync and no shell alias to maintain.

### 2. Bootstrap a project

Run this once per repo you want to use the workflow in:

```bash
# myprefix = Beads issue-ID tag for this repo (acme → acme-1, acme-2)
# Bootstrap: git init if needed → bd init + bd setup claude → scaffold Claude's .claude/ (skills + agents)
agent-workflow-beads bootstrap /path/to/your-repo myprefix

# Opt-in flags — also accepted by `update`, so you can adopt them later
# (and are auto-detected on later runs once the surface exists):
#   --with-opencode      also scaffold the OpenCode implementor agent: .opencode/agents/implementor.md
#   --with-screenshots   web/UI only: attach-web-screenshots skill + cleanup-screenshots.yml CI workflow
agent-workflow-beads bootstrap /path/to/your-repo myprefix --with-opencode --with-screenshots
```

### 3. Refresh later

When this template gets updates, upgrade the CLI (`npm install -g agent-workflow-beads@latest`) and refresh any downstream repo with:

```bash
agent-workflow-beads update /path/to/your-repo
```

For a guided walkthrough of a brand-new project, see [docs/SETUP-NEW-REPO.md](docs/SETUP-NEW-REPO.md).

---

## How to use skills and agents

Once a repo is bootstrapped, Claude Code sees two kinds of building blocks:

- **Skills** — runnable workflows. You invoke a skill by name (e.g. `plan-beads`, `executor-task`) and the model executes the whole workflow end-to-end.
- **Agents** — focused single-purpose roles (PM, architect, reviewer, …). You invoke an agent when you want that specific perspective on the current work.

### The two flows you'll run most often

**Planning** — turn an idea into Beads tasks:

```
plan-beads → brainstorming → (planner-research, optional) → beads-planner → validate-beads
```

**Execution** — pick up one bead, ship one PR:

```
executor-task                # default: PR into main
executor-task-worktree       # same, in an isolated worktree (parallel-safe)
executor-epic-task           # bead belongs to an epic — PR into the epic branch
executor-epic-sequential <epic-id>   # run a WHOLE epic on one branch, fresh session per bead, one PR
executor-epic-sequential-worktree <epic-id>   # same, but in an isolated worktree (main tree untouched)
executor-rework-in-place <bead-id>   # bead was reopened, amend the existing PR
```

**OpenCode implementor (optional).** Add `opencode` to any executor call — e.g. `executor-task <bead-id> opencode`, optionally with `model=<provider/model>` — and only the implementation step runs as a headless `opencode run --agent implementor` (via the `implement-with-opencode` skill). Claude still claims, plans, runs `build-and-test`, reviews the result with its `code-reviewer` (a cross-model review), and closes the bead; test failures and review findings go back to OpenCode as fix rounds. Requires `opencode` on `PATH` and a repo bootstrapped or updated with `--with-opencode`. OpenCode reads the skills from `.claude/skills/` and the instructions from `CLAUDE.md`, so nothing else is duplicated.

Other useful skills you'll reach for:

- `address-pr-comments` — when a reviewer left comments on your PR
- `finishing-a-development-branch` — push and open the PR
- `audit-backlog-rules` — re-check the backlog after editing project rules
- `requesting-code-review` — get a review of the current change before merging

### Full skills catalog

<details>
<summary><b>Planning skills</b> — turn an idea into beads</summary>

| Skill                | What it does                                                                              | When to use                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `plan-beads`         | Full planner-only session: brainstorm → confirm → create beads → stop                     | You have a problem and want to convert it into Beads tasks                           |
| `brainstorming`      | Explores user intent, requirements, and design before any coding                          | Before any creative work — required by `plan-beads` and good as a standalone         |
| `planner-research`   | Resolves factual unknowns after brainstorming                                             | Only when uncertainty would weaken the plan                                          |
| `beads-planner`      | Turns a settled plan into Beads epics + tasks with explicit dependencies                  | After brainstorming/research, when ready to materialize the plan                     |
| `validate-beads`     | Quality-gates an epic (size, contracts, fresh-session safety)                             | After `beads-planner`, before claiming any of its beads for execution                |
| `writing-plans`      | Produces a per-bead execution plan with explicit `## Verification`                        | Inside an executor session, after a bead is claimed — never in a planner session     |
| `audit-backlog-rules`| Audits ready/blocked beads for drift after CLAUDE.md or AGENTS.md rules change            | Right after editing project rules / conventions                                      |

</details>

<details>
<summary><b>Execution skills</b> — one bead end-to-end</summary>

| Skill                           | What it does                                                                               | When to use                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `beads-claim`                   | Finds and claims a ready bead at the start of an executor session                          | Start of an executor session                                                           |
| `executor-task`                 | Full cycle for one bead on a fresh `feat/<bead-id>` branch off main + opens a PR into main | One-bead-per-PR delivery rhythm                                                        |
| `executor-task-worktree`        | Same as `executor-task` but runs in an isolated git worktree                               | When you need to run multiple beads in parallel without branch interference            |
| `executor-epic-task`            | Same as `executor-task` but branches off (and PRs into) the bead's parent epic branch      | Epic delivered as one merge to main; each child bead ships as its own PR into the epic |
| `executor-epic-task-worktree`   | Same as `executor-epic-task` but runs in an isolated git worktree                          | Epic flow + parallel beads + main tree must stay untouched                             |
| `executor-epic-sequential`      | Runs **every** ready bead of one epic sequentially on a single `epic/<epic-bead-id>` branch — each bead in a fresh headless `claude -p` session (clean context per task); blocked beads are skipped; ends with one PR to the default branch | Deliver a whole epic unattended as one branch + one PR, instead of one bead at a time |
| `executor-epic-sequential-worktree` | Same as `executor-epic-sequential` but runs in a sibling git worktree (`../<repo>-epic-<epic-bead-id>`) and never touches the main checkout; leaves the worktree in place for the PR's follow-up | Deliver a whole epic unattended as one branch + one PR while the main tree keeps its in-flight work |
| `executor-rework-in-place`      | Re-execute a reopened bead on the current feature branch; push commits into the existing open PR (no new branch, no new PR); requires `bead_id` | Bead was already executed but the task was wrong — user reopened the bead, updated its requirements, and wants to amend the existing PR |
| `beads-close`                   | Closes the bead, creates follow-ups, commits `.beads/` state                               | Final step of an executor cycle                                                        |

</details>

<details>
<summary><b>Helpers used during implementation</b></summary>

| Skill                            | What it does                                                                                  | When to use                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `systematic-debugging`           | Structured root-cause investigation before proposing a fix                                    | Any bug, test failure, or unexpected behavior                            |
| `verification-before-completion` | Forces real verification commands before claiming "done"                                      | Before committing, opening a PR, or asserting success                    |
| `build-and-test`                 | Runs the literal `## Verification` section of the current execution plan                      | After implementing changes; specialize per repo in stage 2               |
| `implement-with-opencode`        | Runs an executor's implementation step as a headless OpenCode `implementor`, judging the round from git | When an executor was invoked with the `opencode` argument                |

</details>

<details>
<summary><b>Code review & PR delivery</b></summary>

| Skill                            | What it does                                                                          | When to use                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `requesting-code-review`         | Dispatches the `code-reviewer` subagent against the current change                    | After implementing a major task, before merging                              |
| `address-pr-comments`            | Pulls unresolved PR threads → fixes via `pr-comment-fixer` → verifies → push → reply  | When new review comments arrive on the current PR                            |
| `attach-web-screenshots`         | Takes screenshots of a running web app and attaches them to the open PR               | After implementing a UI feature, before or alongside review                  |
| `finishing-a-development-branch` | Pushes the branch and opens a PR                                                      | When all work on a feature branch is done and verified                       |

> `attach-web-screenshots` is opt-in — pass `--with-screenshots` to `agent-workflow-beads bootstrap` (or `agent-workflow-beads update` to adopt later). It ships a companion CI workflow (`.github/workflows/cleanup-screenshots.yml`) that prunes stale screenshot folders for merged branches.

</details>

<details>
<summary><b>Project hygiene & workflow infra</b></summary>

| Skill                      | What it does                                                                          | When to use                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `project-auditor`          | Full-repo audit: naming, folder layout, tech-stack consistency, light architecture    | Project health check (not per-PR — use `requesting-code-review` for diffs)   |
| `prune-local-branches`     | Removes stale local branches whose PRs are merged or closed                           | Periodic cleanup                                                             |

</details>

<details>
<summary><b>Agents — call them directly when you want that perspective</b></summary>

| Agent                  | What it does                                                                          | When to use                                                      |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `product-manager`      | Produces acceptance criteria + done checklist                                         | Early planning, when "done" is fuzzy                             |
| `engineering-manager`  | Critically reviews the PM's spec for feasibility, scope creep, hidden cost            | Right after `product-manager`, before engineering commits        |
| `solution-design`      | High-level solution design — components, contracts, data flow, alternatives           | After acceptance criteria are pinned, before implementation plan |
| `junior-engineer`      | Asks clarifying questions until nothing is ambiguous; returns a numbered list         | Before starting work on cross-cutting / under-specified tasks    |
| `backend-architect`    | Reviews plans + diffs for backend work against opinionated standards                  | Plan touches APIs, services, persistence, queues, jobs           |
| `frontend-architect`   | Reviews plans + diffs for frontend work against opinionated standards                 | Plan touches UI, components, styling, client state               |
| `testing-strategist`   | Produces the test list required to ship a plan/diff with confidence                   | After a plan is settled, before coding — or before opening a PR  |

</details>

<details>
<summary><b>Skill-internal agents</b> (called by a skill, not by you)</summary>

| Agent              | What it does                                                                          | Called by                                  |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `code-reviewer`    | Reviews a completed change against its plan/requirements, reports by severity         | `requesting-code-review`                   |
| `project-auditor`  | Full-repo audit (naming, folders, tech stack, architecture hotspots, dead code)       | `project-auditor` skill                    |
| `pr-comment-fixer` | Reads unresolved PR threads, applies fixes, returns reply plan (does not push/post)   | `address-pr-comments`                      |

</details>

For the internal "who calls whom" graph view of the skills, see [docs/SKILLS_RELATIONSHIPS.md](docs/SKILLS_RELATIONSHIPS.md).

---

## Browse beads visually with bdtui

![bdtui screenshot](https://raw.githubusercontent.com/jsiovn/bdtui/master/docs/images/bdtui-jul-03.png)

[`bdtui`](https://www.npmjs.com/package/bdtui) is a terminal UI for browsing the Beads backlog — ready vs. blocked beads, dependencies, status, the lot. Install once:

```bash
npm install -g bdtui
```

Then run `bdtui` from inside any bootstrapped repo.

---

## Command reference

One cross-platform command, three subcommands:

| Purpose                          | Command                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Bootstrap a new downstream repo  | `agent-workflow-beads bootstrap [--with-screenshots] [--with-opencode] <repo> <prefix>` |
| Refresh shared workflow surface  | `agent-workflow-beads update [--with-screenshots] [--with-opencode] <repo>`            |
| Prerequisite check               | `agent-workflow-beads check [--with-opencode]`                                          |

Run `agent-workflow-beads --help` for the full usage, or `agent-workflow-beads --version` to see the installed version.

---

## More docs

- [docs/INSTALL.md](docs/INSTALL.md) — install `bd`, `dolt`, and the CLI (macOS / Linux / Windows)
- [docs/SETUP-NEW-REPO.md](docs/SETUP-NEW-REPO.md) — guided new-repo walkthrough
- [docs/SKILLS_RELATIONSHIPS.md](docs/SKILLS_RELATIONSHIPS.md) — internal skill graph
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — common issues

---

## Attribution

The bundled execution-quality skills are curated copies derived from `obra/superpowers`, adapted to a Beads-native planning/execution flow with selected ideas from GSD and Khuym. See [ATTRIBUTION.md](ATTRIBUTION.md).
