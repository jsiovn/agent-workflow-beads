---
name: writing-plans
description: 'Use when you have a spec or requirements for a multi-step task, before touching code. This is an executor skill - use only when a bead has been claimed and you are in an executor session, NOT in a planner session.'
---

# Writing Plans

**Workflow position:** Executor session, step 2 of 8 (after claiming bead). Next: implement -> `build-and-test` -> `verification-before-completion` -> `requesting-code-review` -> `beads-close`. See BEADS_WORKFLOW.md.

## Overview

Write implementation plans for an engineer who has not seen this codebase or this bead. Assume they write idiomatic code in the project's language once they know the exact interface and the exact test, and that they will make a reasonable choice wherever the plan leaves one open. What they cannot know is what you decided: which files, which names and signatures, which values from the bead, which tests prove each task. Document those. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD (follow the `test-driven-development` skill). Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

<HARD-GATE>
This is an **executor skill**. It should only be invoked in a session where a bead has been claimed (`bd update <id> --claim`, status `in_progress`). Do NOT invoke this in a planner session that just ran `brainstorming`, `planner-research`, or `beads-planner`.
</HARD-GATE>

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

- **Commit the plan on the current branch as soon as it is saved and self-reviewed** (see Self-Review below), as its own commit: `git add docs/plans/<file>.md && git commit -m "docs(plan): <BEAD_ID> <short title>"`. Plans are tracked files: they travel with the branch (and its worktree) and land in the PR. Committing first also keeps the tree clean before implementation starts. If the plan is revised later (e.g. a rework), commit the revision the same way.
- A plan committed on a feature or epic branch is not visible from other branches until it merges. If a teammate or a fresh executor elsewhere must read it before then, also inline it into the bead's `notes` (`bd update <id> --append-notes "$(cat docs/plans/<slug>.md)"`) so it syncs via Dolt.
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it was not, suggest breaking this into separate plans - one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Fold setup, configuration, scaffolding, and documentation steps into the task whose deliverable needs them; split only where a reviewer could meaningfully reject one task while approving its neighbor. Each task ends with an independently testable deliverable.

## Step Granularity

**Each step is one action with a checkable result:**

- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use subagents when appropriate to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Bead:** [<BEAD_ID> — the bead this plan implements; executors read `bd show <BEAD_ID>` alongside the plan]

## Global Constraints

[The bead's project-wide requirements — version floors, dependency limits, naming and copy rules, platform requirements — one line each, with exact values copied verbatim from the bead. Every task's requirements implicitly include this section.]

## Review Focus

[Up to five input classes or failure modes the bead implies but no task's tests exercise that are most likely to bite a person using this software — one line each, naming the input or condition and the behavior a reasonable person would expect, most likely first. The bead's silence on an input is not permission for that input to break the program. For each line, add the test that pins it to the task that owns the code.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**

- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter and return types]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement `function(input: InputType) -> ResultType` in `exact/path/to/file.py`**

One line on the approach when the signature and the test leave a choice (which library call, which data structure); a code block only for an algorithm they do not determine.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## What a Step Contains

A step is done when the implementer can write exactly one reasonable thing from it: unambiguous, not complete. Each kind of step carries what makes it unambiguous and nothing more:

- **A test step:** the test's name and its assertions, as code, with the bead's exact values in them.
- **A code step:** the exact signature (name, parameters, return type), the file it lives in, and the specific values the bead pins. The implementer writes the body. A body appears only for an algorithm the signature and tests do not determine, or for exact copy the bead fixes.
- **A verification step:** the command to run and the output that means it passed.
- **A reference to another task:** that task's Interfaces block says what to use; the plan does not repeat that task's code.

A plan is the set of decisions the implementer cannot make alone. A plan longer than the code it describes has written the code instead. Lines that decide nothing ("TBD", "handle edge cases", "add appropriate validation", "write tests for the above", a type or function no task defines) are the opposite failure, and the self-review catches both.

## Verification Section (REQUIRED)

Every plan MUST end with a `## Verification` section that defines how to test the changes against the live system. This section is what `build-and-test` will execute after implementation.

Include:

- **What to build** - which components need rebuilding
- **How to deploy** - exact deploy commands
- **What to test** - specific API calls, expected responses, or observable behaviors
- **Success criteria** - what output or behavior means "it works"
- **Working directory and prerequisites** - when commands must run from a specific directory, need env vars, require a device, container, browser, fixture data, or seeded state

The verification section must be executable without guesswork. Assume the repo is still using the generic stage-1 `build-and-test` skill unless a repo-specific specialization already exists.

That means:

- write exact shell commands, not summaries
- prefer repo-owned wrapper commands when platform differences matter, such as local Windows with remote POSIX or Windows SSH execution
- include URLs, ports, endpoints, paths, and process names when relevant
- name the expected output, status code, DOM text, screenshot cue, or log line
- say when manual browser inspection is required and what to look for
- state whether a missing optional dependency such as a seeded database, a running service, or a live external API should fail the bead or downgrade the check to a skipped optional smoke test

Example:

```markdown
## Verification

**Build:** `npm run build`
**Deploy:** `npm run preview -- --port 4173` (serve the production build)
**Smoke test:** `curl http://localhost:4173/api/health` -> `{"status": "ok"}`

**Functional tests:**

1. Create a record: `curl -X POST http://localhost:4173/api/todos -H 'Content-Type: application/json' -d '{"title":"buy milk"}'` -> 201 with a JSON body containing an `id`
2. List records: `curl http://localhost:4173/api/todos` -> 200, array includes the new todo
3. Observe in browser: open http://localhost:4173, confirm the new todo renders in the list

**Success criteria:** All functional tests pass, no errors in the server log or the browser console
```

Without this section, `build-and-test` will not know what to verify. Make it specific to the bead.

If you notice the same verification sequence repeating across multiple beads, that is a signal to specialize the repo-local `build-and-test` skill as stage 2 work.

## Self-Review

After writing the complete plan, re-read the bead (`bd show <BEAD_ID>`) with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

1. **Bead coverage:** Skim each requirement and acceptance criterion in the bead. Can you point to a task that implements it? Add a task for any gap.
2. **Step scan:** Every step must let the implementer write exactly one reasonable thing, and no step may carry more than that: a line that decides nothing is a gap, a function body the signature and tests already determine is a transcript. Fix both.
3. **Type consistency:** Do the types, signatures, and property names used in later tasks match what earlier tasks defined? `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.
4. **Review Focus:** For each input class or failure mode the bead implies, is there a task whose tests exercise it? The uncovered ones most likely to bite a person go in Review Focus, and each gets its test added to the owning task. An empty section means you checked and found none, not that you skipped the check.
5. **Proportion:** A plan several times longer than the bead it implements is a transcript of the program, not a plan. If code blocks are most of the document, replace bodies with signatures, test names and assertions.
6. **Verification:** The `## Verification` section exists and every command in it is exact.

Fix issues inline and move on; no re-review is needed. Commit the plan after the self-review passes.

## Execution Handoff

After saving and committing the plan:

**"Plan complete and committed at `docs/plans/<filename>.md`. Ready to execute?"**

- If this skill was invoked by `/executor-task` or `/executor-task-worktree`, proceed to implementation automatically — do not wait for confirmation.
- Otherwise, wait for user confirmation before proceeding.

**When proceeding:** Implement task by task following `test-driven-development`. Use subagents when they help. The executor chain runs `requesting-code-review` once for the whole bead after verification.

**After implementation is complete:** Invoke `build-and-test` (read the repo-local skill — `.claude/skills/build-and-test/SKILL.md` — and follow it). The skill executes the verification contract from the plan and may be generic or repo-specific depending on the repo's maturity. If `build-and-test` fails, fix the implementation or tighten the plan and re-run it before moving to verification. Do NOT skip this step.
