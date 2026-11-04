---
name: audit-backlog-rules
description: 'Audit ready and blocked beads for drift against the current CLAUDE.md / AGENTS.md rules (folder structure, naming conventions, project rules). Use after editing CLAUDE.md or AGENTS.md to find beads whose Read/Files/Inputs/Verify sections still reference old conventions, paths, or rules.'
---

# Audit Backlog Against Rules

Re-read the current project rules and report which open beads in the backlog still reflect the old rules.

## When To Use

- The user just updated `CLAUDE.md`, `AGENTS.md`, `BEADS_WORKFLOW.md`, or any `docs/` file that defines folder structure, naming, or coding rules.
- The user explicitly asks to "re-check tasks against the new rules" or "audit the backlog after the CLAUDE.md change".

Do **not** use this for:

- Auditing the source code itself — that is `project-auditor`.
- Validating a single epic for autonomous execution — that is `validate-beads`.
- Reviewing in-progress or closed beads.

## Steps

1. Confirm the repo is bd-initialized. If `bd` is not available or `.beads/` is missing, stop and tell the user to bootstrap first.
2. Load the current rules surface. Read in this order, skipping any that are absent:
   - `CLAUDE.md`
   - `AGENTS.md`
   - `BEADS_WORKFLOW.md`
   - `PRIME.md`
   - any `docs/conventions*.md`, `docs/architecture*.md`, or similar conventions files the user names
     Extract the concrete rules: folder layout, naming conventions, file-placement rules, required commands, forbidden patterns.
3. List the audit set:
   - `bd ready --json --brief` for ready beads
   - `bd list --status blocked --json --brief` for blocked beads
     (`--brief` lists ids and titles only; step 4 fetches each bead in full)
     Deduplicate. If the result is empty, report that and stop.
4. For each bead, fetch the full description and notes (`bd show <id> --json`) and compare against the rules collected in step 2. Look for:
   - `Files:` paths that no longer match the new folder structure
   - `Read:` references to renamed, moved, or deleted files
   - file or symbol names in the description that violate the new naming convention
   - `Verify:` commands that conflict with new build/test rules
   - acceptance criteria that contradict a newly added rule (e.g. "store config in X" when the rule now says "config lives in Y")
   - assumptions about tech stack, layout, or workflow that the rules update invalidated
5. Classify each finding:
   - **blocking** — the bead would actively produce wrong work if claimed as-is (wrong files, wrong layout, contradicts a hard rule)
   - **stale** — the bead still works but uses outdated wording, paths, or references
   - **clean** — no drift detected
6. Report grouped by classification. For every non-clean bead include:
   - bead id and title
   - the specific rule it drifts from (quote the rule line)
   - the offending excerpt from the bead
   - a concrete suggested fix as a `bd update <id> --description ...` or `bd note <id> ...` command the user can run
7. End with a one-line summary: counts of blocking / stale / clean, and a recommendation:
   - if any blocking → "Fix blocking beads before the next `bd ready` claim."
   - if only stale → "Safe to keep working; clean up stale beads opportunistically."
   - if all clean → "Backlog is aligned with the current rules."

## Hard Rules

- Do not edit beads. This skill reports and proposes commands; the user decides what to apply.
- Do not claim beads, run `beads-claim`, or start implementation work.
- Do not audit `in_progress` or `closed` beads — workers already in flight handle their own bead, and closed beads are history.
- Do not invent rules. Only flag drift against rules that are actually present in the files read in step 2. If a bead looks wrong but no rule covers it, skip it (or surface it as a question, not a finding).
- Do not summarize or truncate the per-bead findings. The user needs the full list to act on it.
