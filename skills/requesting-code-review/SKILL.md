---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Dispatches the repo-local code-reviewer subagent.
---

# Requesting Code Review

Dispatch the repo-local `code-reviewer` subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## Where the reviewer lives

The `code-reviewer` subagent definition is the single source of truth for the reviewer's checklist, severity rules, and output format. In this template it lives at `agents/code-reviewer.md`. The scaffold always installs it into the downstream repo at `.claude/agents/code-reviewer.md`, and, when the repo was scaffolded with `--with-omp` / `--with-opencode`, generated copies at `.omp/agents/code-reviewer.md` / `.opencode/agents/code-reviewer.md` (never edit those; edit the source and re-run `update`). If it is missing, run `agent-workflow-beads update` against the repo to install it.

The prompt template at `brief.md` (alongside this `SKILL.md`) is **only** the dynamic brief — placeholders for what was built, the plan, and the SHA range. It deliberately does not repeat the checklist; the agent definition already has it.

## When to Request Review

**Mandatory:** once per bead, after `verification-before-completion` and before `beads-close`; before merge for work that is not a bead.

**Optional but valuable:** when stuck (fresh perspective), before a refactor (baseline check).

## How to Request

**1. Commit, then get the review range.** The reviewer reads commits, so commit everything first: `git status --porcelain` must print nothing.

**Change scope:** every file in `git diff --name-only <BASE>..HEAD` plus every path in `git status --porcelain`; never `git diff HEAD` alone, which is empty once the work is committed. `<BASE>` = `git merge-base HEAD origin/<branch this work merges into>` (the PR base: the default branch or `epic/<id>`), unless the task prompt, or the `Base-SHA:` note of the bead this session is executing, names a commit between that merge-base and HEAD: then that commit.

```bash
BASE_SHA=<BASE>
HEAD_SHA=$(git rev-parse HEAD)
```

The range is the whole change of this bead or PR, never the last commit alone: the plan is committed first and code lands in several commits. Sanity-check it with `git diff --stat <BASE_SHA>..<HEAD_SHA>`: empty, or only the plan file, means the range is wrong. Fix it before dispatching.

**2. Dispatch the `code-reviewer` subagent:**

Dispatch the `code-reviewer` agent with your CLI's subagent tool (Claude Code: Task tool, `subagent_type`; OpenCode: `subagent` tool, `agent`; omp: `task` tool, `agent` inside `tasks[]`), with a prompt built from the template at `requesting-code-review/brief.md` (this file is shipped alongside the SKILL.md). No agent of that name in this CLI (repo scaffolded without `--with-opencode` / `--with-omp`) → the general subagent, told to first read `.claude/agents/code-reviewer.md`: prefix the same filled brief with "First read `.claude/agents/code-reviewer.md` and follow it as your standing instructions. You are read-only: never edit, stage, or commit files." Do not substitute any other built-in reviewer agent (omp's `reviewer` included); the repo's checklist lives in that file.

**Placeholders to fill in the prompt:**

- `{WHAT_WAS_IMPLEMENTED}` — what you just built
- `{PLAN_OR_REQUIREMENTS}` — what it should do (cite the plan file or bead description)
- `{BASE_SHA}` — starting commit
- `{HEAD_SHA}` — ending commit
- `{DESCRIPTION}` — brief summary
- `{VERIFY_COMMANDS}` — the plan's `## Verification` commands the reviewer may re-run (short, existing checks only), or `none`

The subagent will run `git diff` itself, read the changed files, and return a structured review that opens with `### Reviewed` (the range it diffed, uncommitted paths it did not review, checks it ran) and tags every Critical / Important finding `Evidence: ran | traced | unverified`. It never edits code; it may re-run the listed checks.

The reviewer always grounds itself in the repo's layered `CLAUDE.md` conventions (defined in the agent definition, noted here so callers know to expect it): for every changed file it reads the nearest `CLAUDE.md` walking up from the file's directory (e.g. `apps/web/CLAUDE.md` for web changes, `packages/utils/CLAUDE.md` for utils changes) plus the root `CLAUDE.md`, and judges the diff against those rules — including the root comment-discipline convention — not generic best practices.

**3. Act on the review — the fix loop:**

1. **Check the range.** The review must echo `<BASE_SHA>..<HEAD_SHA>` under `### Reviewed`. A different range, or a reviewer that stopped on a plan-only range, means the review covers the wrong change: fix the range and dispatch again.
2. **Check the tree.** `git status --porcelain` must still print nothing (the reviewer may have run checks). Build output those checks produced is removed; any other change stops here: tell the user, or in an unattended run block the bead.
3. **Prove each Critical and Important finding before changing code.** Reproduce it (a failing command or test) or trace it through the current code. A finding you refute is not fixed: record it with the reason for the closeout note's `Decisions:` line. `Evidence: unverified` findings get the same check; never fix one blind.
4. **Fix → commit → re-verify.** Commit the fixes, then run `build-and-test` again on the **whole** change (the change-scope file list, not just the fix) and `verification-before-completion`. A fix voids the earlier pass.
5. **One re-review, only if a Critical was fixed.** Dispatch the reviewer once more on the fix range (`<HEAD_SHA before the fixes>..HEAD`). No further rounds.
6. **A Critical still open after that** blocks the bead in an unattended run (`beads-close` _Rules_ has the one safe form) and goes to the user in an interactive one. Never close a bead over an open Critical.

Minor findings: fix them in the same loop if trivial, otherwise note them as a follow-up bead.

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with an unproven fix or an unverified finding
- Treat the earlier `build-and-test` pass as still valid after a fix
- Argue with valid technical feedback

**If reviewer wrong:**

- Push back with technical reasoning
- Show the command or trace that refutes the finding, and record it under `Decisions:`
- Request clarification

## Files in this skill

- `SKILL.md` — this file
- `brief.md` — the prompt template (dynamic brief only) you fill in and pass to the subagent

The reviewer's standing instructions live separately at `agents/code-reviewer.md` in the template root and are deployed by the scaffold to `.claude/agents/code-reviewer.md` (plus the generated `.omp/agents/` / `.opencode/agents/` copies when those flags were used).

## Pairing with `verification-before-completion`

The executor chain in `executor-task` and `executor-task-worktree` runs `verification-before-completion` first (run the verification commands and read the output), then `requesting-code-review` (dispatch the reviewer subagent). Both are required before `beads-close` — they are NOT alternatives. `verification-before-completion` proves the change passes its own checks; `requesting-code-review` gives an independent reviewer's perspective on quality, regressions, and architectural drift before the bead closes.
