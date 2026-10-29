---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Dispatches the repo-local code-reviewer subagent.
---

# Requesting Code Review

Dispatch the repo-local `code-reviewer` subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## Where the reviewer lives

The `code-reviewer` subagent definition is the single source of truth for the reviewer's checklist, severity rules, and output format. In this template it lives at `agents/code-reviewer.md`. The scaffold always installs it into the downstream repo at `.claude/agents/code-reviewer.md`. If it is missing, run `agent-workflow-beads update` against the repo to install it.

The prompt template at `brief.md` (alongside this `SKILL.md`) is **only** the dynamic brief — placeholders for what was built, the plan, and the SHA range. It deliberately does not repeat the checklist; the agent definition already has it.

## When to Request Review

**Mandatory:**

- After each task in subagent-driven development
- After completing a major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing a complex bug

## How to Request

**1. Get git SHAs:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch the `code-reviewer` subagent:**

Call the Task tool with `subagent_type: code-reviewer` and a prompt built from the template at `requesting-code-review/brief.md` (this file is shipped alongside the SKILL.md).

**Placeholders to fill in the prompt:**

- `{WHAT_WAS_IMPLEMENTED}` — what you just built
- `{PLAN_OR_REQUIREMENTS}` — what it should do (cite the plan file or bead description)
- `{BASE_SHA}` — starting commit
- `{HEAD_SHA}` — ending commit
- `{DESCRIPTION}` — brief summary

The subagent will run `git diff` itself, read the changed files, and return a structured review (Strengths / Critical / Important / Minor / Assessment). It is read-only — it cannot modify code.

The reviewer always grounds itself in the repo's layered `CLAUDE.md` conventions (defined in the agent definition, noted here so callers know to expect it): for every changed file it reads the nearest `CLAUDE.md` walking up from the file's directory (e.g. `apps/web/CLAUDE.md` for web changes, `packages/utils/CLAUDE.md` for utils changes) plus the root `CLAUDE.md`, and judges the diff against those rules — including the root comment-discipline convention — not generic best practices.

**3. Act on feedback:**

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if the reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request a code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/2026-04-30-deployment.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed (with fixes)

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-driven development:**

- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing plans:**

- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-hoc development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**

- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

## Files in this skill

- `SKILL.md` — this file
- `brief.md` — the prompt template (dynamic brief only) you fill in and pass to the subagent

The reviewer's standing instructions live separately at `agents/code-reviewer.md` in the template root and are deployed by the scaffold to `.claude/agents/code-reviewer.md`.

## Pairing with `verification-before-completion`

The executor chain in `executor-task` and `executor-task-worktree` runs `verification-before-completion` first (run the verification commands and read the output), then `requesting-code-review` (dispatch the reviewer subagent). Both are required before `beads-close` — they are NOT alternatives. `verification-before-completion` proves the change passes its own checks; `requesting-code-review` gives an independent reviewer's perspective on quality, regressions, and architectural drift before the bead closes.
