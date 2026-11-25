# Code Review Brief

This is the prompt template the `requesting-code-review` skill fills in and passes to the `code-reviewer` subagent. The reviewer's standing instructions (checklist, output format, severity rules) live in the agent definition at `agents/code-reviewer.md` in this template, deployed to `.claude/agents/code-reviewer.md` in downstream repos. Do **not** duplicate the checklist here — the agent already has it.

Fill in every `{PLACEHOLDER}` below before dispatching.

---

## What Was Implemented

{DESCRIPTION}

## Requirements / Plan

{PLAN_OR_REQUIREMENTS}

## Git Range to Review

**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

Run your own `git diff --stat {BASE_SHA}..{HEAD_SHA}` and `git diff {BASE_SHA}..{HEAD_SHA}` to inspect the change. Read changed files in full when context matters. Echo this exact range under `### Reviewed`; if it is empty or holds only the plan file, say so and stop.

## Checks You May Run

{VERIFY_COMMANDS}

Only these, only while `git rev-parse HEAD` equals {HEAD_SHA}, and none that installs, starts a service or edits files.

## Notes for the Reviewer

- Follow the checklist and output format from your agent definition.
- Compare the implementation against the plan/requirements above.
- Sample the surrounding repo for conventions before judging the diff.
- Return a structured review: Reviewed / Strengths / Critical / Important / Minor / Recommendations / Assessment, with `Evidence: ran | traced | unverified` on every Critical and Important finding.
