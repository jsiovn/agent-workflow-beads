---
name: project-auditor
description: 'Run a full-repo audit covering naming conventions, folder structure, tech stack consistency, and a light architectural pass. Use when the user asks to audit, review consistency, or get a project health check.'
---

# Project Auditor

Dispatch the `project-auditor` subagent against the current repository.

The agent's definition is `.claude/agents/project-auditor.md` (source: `agents/project-auditor.md` in the template), with generated copies at `.omp/agents/project-auditor.md` / `.opencode/agents/project-auditor.md` when the repo was scaffolded with `--with-omp` / `--with-opencode`. If it is missing, run `agent-workflow-beads update` against the repo.

## Steps

1. Dispatch the `project-auditor` agent with your CLI's subagent tool (Claude Code: Task tool, `subagent_type`; OpenCode: `subagent` tool, `agent`; omp: `task` tool, `agent` inside `tasks[]`), with the current repo root as context. No agent of that name in this CLI (repo scaffolded without `--with-opencode` / `--with-omp`) → the general subagent, told to first read `.claude/agents/project-auditor.md` and follow it as its standing instructions. It is read-only: never edit, stage, or commit files.
2. Wait for the audit report to complete.
3. Present the report to the user as-is — do not summarize or filter findings.

## Hard Rules

- Do not run this on a single file or diff — that is the `code-reviewer` agent's job.
- Do not truncate or editorialize the report. The user asked for the full audit.
