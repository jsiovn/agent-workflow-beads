---
name: finishing-a-development-branch
description: 'Use when a branch''s work is committed, verified and closed out, to push it and open its pull request. Owns the PR contract (base, title, body with verification evidence, Bead:/Epic: lines) for every executor: a bead branch into the default branch or an epic branch, and an epic branch into the default branch.'
---

# Finishing a Development Branch

**Workflow position:** Final step of every executor flow, after `beads-close` (per-bead executors) or after the loop (epic drivers). See BEADS_WORKFLOW.md.

**Announce at start:** "I'm using the finishing-a-development-branch skill to push and create a PR."

This skill is the only place the PR contract lives. Executors pass their inputs and follow it; they do not build their own `gh pr create` line.

## Inputs

- `<BASE_BRANCH>` — the branch the PR merges into, given by the caller: `<DEFAULT_BRANCH>` or `<EPIC_BRANCH>`. Not given → the detected default branch: `git symbolic-ref refs/remotes/origin/HEAD` (strip `origin/`), else `main` if it exists, else `master`.
- Trailer lines, given by the caller:
  - a bead into the default branch: `Bead: <BEAD_ID>`
  - a bead into an epic branch: `Epic: <EPIC_BEAD_ID>` and `Bead: <BEAD_ID>`
  - an epic branch into the default branch: `Epic: <EPIC_BEAD_ID>`
- `<BODY_FILE>` (optional) — a body the caller already built (the epic drivers do, see _Epic PR body_). Otherwise step 3 builds it.

## Prerequisites

- The bead is closed with a closeout note (`beads-close`), or — for an epic PR — the run's loop has finished
- `build-and-test` passed after the last edit
- All changes are committed

## Steps

### 1. Verify the branch

```bash
bd where
git status --porcelain
git fetch origin <BASE_BRANCH>
git log --oneline origin/<BASE_BRANCH>..HEAD
```

- The working tree must be clean. If it is not, stop and ask the user to commit; never stash or `git add -A` on their behalf.
- There must be commits ahead of `origin/<BASE_BRANCH>` (no `origin/<BASE_BRANCH>` ref: compare with the local `<BASE_BRANCH>`).
- `bd where` must succeed in the current checkout.

### 2. Push the branch

```bash
git push -u origin HEAD
```

If push fails (no remote, auth), report the error and stop.

### 3. Title and body

**Title:** conventional commits (`type(scope): description`), no bead id prefix, at most 72 characters, describing the outcome of the whole branch, not its last commit.

**Body:** skip this when the caller passed `<BODY_FILE>`. Otherwise read the bead's last closeout note (`bd show <BEAD_ID> --json`: the block from the last `Outcome:` line) and write the body with the file-writing tool to `<BODY_FILE>` = `<TMP>/<BEAD_ID>-pr-body.md` (`<TMP>` = the session's scratch directory when the CLI provides one, else the OS temp directory; never inside the repo). About 40 lines. Drop an empty section, except `## Verification`, which is required:

```markdown
## Why
<the problem, from the bead's description: one to three lines>

## What changed
<from the note's Outcome: line and the commits, as bullets>

## Verification
<the note's Verified: lines, verbatim: each command and what it showed>

## Decisions
<the note's Decisions: lines, refuted review findings included>

## Risk
<what could break, what was not verified, the plan's ## Open Review Points>

## Follow-ups
<follow-up and lesson beads created, by id>

Epic: <EPIC_BEAD_ID>
Bead: <BEAD_ID>
```

- No closeout note, or no `Verified:` line in it → stop: the bead was not closed out. Run `beads-close` step 1 first.
- The trailer lines are literal and come last, one per line. Leave out `Epic:` for a bead into the default branch.

### 4. Create the pull request

```bash
gh pr create --base <BASE_BRANCH> --title "<title>" --body-file <BODY_FILE>
```

The body always goes through `--body-file`. Never let `gh` fill it from the commits (that drops the evidence), and never pass the body inline as a quoted string (backticks and `$` in commands break shell quoting).

### 5. Report completion

```
PR created: <url>
Branch: <branch-name> → <BASE_BRANCH>
```

## Epic PR body

The epic drivers (`executor-epic-sequential`, `executor-epic-sequential-worktree`) build `<BODY_FILE>` themselves, from the bead notes, with one command, so the driver's context stays thin. `## Delivered` replaces _What changed_, _Verification_ and _Decisions_: it carries each delivered bead's `Outcome:`, `Verified:` and `Decisions:` lines. `## Blocked or skipped` lists every other child with its last `Blocked:` line and any `Left commits:` range. The bead id and each label are bold, and every field is its own sub-bullet (wrapped lines indented under it), so a long body stays scannable.

```bash
{ cat <<'EOF'
## Why

<the epic's goal, one to three lines from its description>

EOF
bd list --parent <EPIC_BEAD_ID> --all --limit 0 --json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const D=[],B=[],F=l=>{const m=l.match(/^(Outcome|Verified|Decisions):\s*(.*)$/);return m?"  - **"+m[1]+":** "+m[2]:"    "+l.trim();};
for(const b of JSON.parse(s)){const L=(b.notes||"").split("\n").map(l=>l.trimEnd()),last=p=>L.filter(l=>l.startsWith(p)).pop(),lc=last("Left commits:");
if(b.status==="closed"){const i=L.map(l=>l.startsWith("Outcome:")).lastIndexOf(true),j=L.findIndex((l,k)=>k>i&&l.startsWith("Persisted:"));
D.push("- **"+b.id+"** "+b.title,...(i<0?["  - (no closeout note)"]:L.slice(i,j<0?L.length:j).filter(l=>l.trim()).map(F)));}
else B.push("- **"+b.id+"** "+b.title+": "+(b.status==="blocked"?(last("Blocked:")||"Blocked: no reason recorded").replace(/^Blocked:/,"**Blocked:**"):"not run ("+b.status+")")+(lc?" ("+lc.replace(/^Left commits:/,"**Left commits:**")+")":""));}
console.log(["## Delivered",...(D.length?D:["none"]),"","## Blocked or skipped",...(B.length?B:["none"])].join("\n"));});'
printf '\nEpic: %s\n' "<EPIC_BEAD_ID>"
} > "<RUN_TMP>/pr-body.md"
```

Read back only its line count (`wc -l`), then continue at step 1 with `<BASE_BRANCH>` = `<DEFAULT_BRANCH>` and `<BODY_FILE>` = `<RUN_TMP>/pr-body.md`.

## Hard Rules

- Never force-push unless the user explicitly asks
- Never delete the remote branch — let the PR merge process handle that
- Never merge locally — the PR is the merge mechanism
- If `gh` is not available, push the branch and report the branch name, the intended `--base <BASE_BRANCH>`, and the body file path for manual PR creation

## Quick Reference

| Situation                         | Action                                               |
| --------------------------------- | ---------------------------------------------------- |
| Uncommitted changes               | Stop, ask user to commit                             |
| No commits ahead of the base      | Stop, nothing to PR                                  |
| No closeout note / `Verified:`    | Stop, run `beads-close` step 1                       |
| Push fails                        | Report error, stop                                   |
| `gh` not installed                | Push branch, report base and body file for manual PR |
| PR creation fails                 | Report error, branch is pushed                       |

## Beads Runtime Discipline

- Treat Beads as local runtime. Do not try to publish live `.beads` state through Git during normal branch completion.
- Workflow scaffold files are committed to this repo's git and are pushed with the feature branch like any other tracked file.
- Plan files under `docs/plans/` are tracked too: `writing-plans` commits each bead's plan on its branch, so it is pushed with the branch and appears in the PR.
- If `bd where` fails, stop and repair the checkout with `bd bootstrap --yes` before pushing or creating a PR.

## Integration

**Called by:**

- **`executor-task`** / **`executor-task-worktree`** — `<BASE_BRANCH>` = `<DEFAULT_BRANCH>`, trailer `Bead:`
- **`executor-epic-task`** / **`executor-epic-task-worktree`** — `<BASE_BRANCH>` = `<EPIC_BRANCH>`, trailers `Epic:` and `Bead:`
- **`executor-epic-sequential`** / **`executor-epic-sequential-worktree`** — `<BASE_BRANCH>` = `<DEFAULT_BRANCH>`, `<BODY_FILE>` from _Epic PR body_
- Any workflow that completes work on a feature branch

**Pairs with:**

- **`beads-close`** — its closeout note is the source of the body
- **`build-and-test`** — must pass after the last edit before invoking this skill
