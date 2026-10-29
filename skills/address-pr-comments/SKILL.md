---
name: address-pr-comments
description: Use to iteratively address unresolved review comments on the current PR. Fetches unresolved inline threads AND non-inline conversation comments, dispatches the pr-comment-fixer subagent to apply fixes, then verifies, commits, pushes, and posts replies. The reviewer resolves threads on their side; rerun the skill when new comments arrive.
---

# Addressing PR Review Comments

**Announce at start:** "I'm using the address-pr-comments skill to fetch unresolved review comments and dispatch the pr-comment-fixer subagent."

This skill is a thin driver. The heavy work — reading files and applying fixes — happens in the `pr-comment-fixer` subagent so the main session stays clean across iterative review cycles. **You never resolve threads.**

Two sources of feedback are checked on every run:

- **Inline threads** — PR review threads anchored to specific file/line positions (GraphQL `reviewThreads`). Tracked by `isResolved` + 👀 on the review comment.
- **Conversation items** — PR-level issue comments, e.g. a bot's top-level review summary (REST `issues/$PR_NUMBER/comments`). Tracked by 👀 on the issue comment (there is no `isResolved` for these).

## Where the subagent lives

- `.claude/agents/pr-comment-fixer.md`

If it is missing, run `agent-workflow-beads update` against the repo to install it.

## Prerequisites

- Working directory is the downstream repo with the PR's feature branch checked out.
- `gh` CLI is installed and authenticated (`gh auth status`).
- Working tree is clean (or any uncommitted changes are intentional).
- `gh pr view` succeeds — the branch has an open PR.

If any prerequisite fails, stop and report.

## Steps

### 1. Identify the PR, repo, and "us"

```bash
gh pr view --json number,headRefName,url,state,author -q '{number, branch: .headRefName, url, state, author: .author.login}'
gh repo view --json owner,name -q '{owner: .owner.login, name}'
```

Capture `OWNER`, `REPO`, `PR_NUMBER`, and `AUTHOR_LOGIN` (the PR author — this is "us" for the purpose of detecting our own replies). If `state != OPEN`, stop.

### 2. Fetch all actionable review feedback

Run both fetches. Combine results into a single actionable list.

#### 2a. Inline review threads (GraphQL)

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 50) {
              nodes {
                databaseId
                author { login }
                body
                path
                line
                diffHunk
                url
                createdAt
                reactions(first: 20, content: EYES) {
                  nodes { user { login } }
                }
              }
            }
          }
        }
      }
    }
  }' -F owner="$OWNER" -F repo="$REPO" -F pr="$PR_NUMBER"
```

A thread is **actionable** when both hold:

1. `isResolved == false`
2. The latest reviewer comment (latest `comments.nodes[]` where `author.login != AUTHOR_LOGIN`) does **not** have a 👀 reaction from `AUTHOR_LOGIN`

Keep `isOutdated` threads if they pass both filters.

#### 2b. Conversation comments (REST)

```bash
gh api "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" --paginate
```

For each comment where `author.login != AUTHOR_LOGIN`, fetch its 👀 reactions:

```bash
gh api "repos/$OWNER/$REPO/issues/comments/$COMMENT_ID/reactions?content=eyes"
```

A conversation comment is **actionable** when the 👀 list contains no entry with `user.login == AUTHOR_LOGIN`.

Skip comments authored by `AUTHOR_LOGIN` (those are our own prior replies, not reviewer asks).

#### Combined filter

If zero actionable items remain across both sources, report "No actionable unresolved feedback (all already 👀'd or resolved)" and stop.

### 3. Build the brief and dispatch the subagent

Transform the results into the brief schema the subagent expects. Every item has a `kind` field.

**Inline thread item:**

- `kind: "inline"`
- `thread_id` — the GraphQL `id`
- `root_comment_id` — `comments.nodes[0].databaseId`
- `latest_reviewer_comment_id` — `databaseId` of the most recent comment where `author.login != AUTHOR_LOGIN`
- `path`, `line`, `is_outdated`
- `comments[]` — all messages oldest-first, each with `author.login` and `body`
- `diff_hunk`, `url`

**Conversation item:**

- `kind: "conversation"`
- `comment_id` — the issue comment `id` (used for reply and reaction)
- `author` — comment author login (e.g. `claude[bot]`)
- `url` — direct link to the comment
- `comments[]` — single-element array `[{author: login, body: full_body}]`

Dispatch the `pr-comment-fixer` subagent:

Task tool with `subagent_type: pr-comment-fixer`, prompt = the JSON brief plus a one-line preamble: `Address these unresolved review items on PR #<num>. Brief follows.`

The subagent edits files and returns a JSON summary (schema in its definition). It does **not** commit, push, or call any GitHub API.

### 4. Verify

Run the repo's `build-and-test` skill (or the project's standard verification command). If verification fails, fix the regression — do not push broken fixes. If you cannot reconcile what the subagent did with the test failure, surface the diff to the user before continuing.

### 5. Commit

Single commit per skill run. Default message:

```bash
git add -A
git commit -m "fixup: address review comments on PR #$PR_NUMBER"
```

If the project preserves history on merge (no squash), prefer `git commit --fixup=<sha>` against the original feature commit so an autosquash rebase is clean. Ask the user which the project uses if it is not obvious from existing branch history.

### 6. Push

```bash
git push
```

If push fails (diverged history, etc.), stop and ask. **Never force-push** without explicit permission.

### 7a. Post replies — inline threads

For each item in the subagent's output where `kind == "inline"`, replace `<sha>` with the short SHA (`git rev-parse --short HEAD`) and post a thread reply:

```bash
gh api -X POST \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments/$ROOT_COMMENT_ID/replies" \
  -f body="$REPLY_BODY"
```

### 7b. Post replies — conversation items

For each item where `kind == "conversation"`, replace `<sha>` and post a new issue comment on the PR:

```bash
gh api -X POST \
  "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" \
  -f body="$REPLY_BODY"
```

GitHub has no reply-to for issue comments — post a new top-level comment. The subagent's `reply_body` should reference the reviewer's comment with a quote or `@mention` so context is clear.

### 7c. 👀 the source comment

After each reply posts successfully, react with 👀 on the reviewer's comment so the next run knows it was addressed.

**For inline threads** — react on the PR review comment:

```bash
gh api -X POST \
  "repos/$OWNER/$REPO/pulls/comments/$LATEST_REVIEWER_COMMENT_ID/reactions" \
  -f content="eyes"
```

**For conversation items** — react on the issue comment:

```bash
gh api -X POST \
  "repos/$OWNER/$REPO/issues/comments/$COMMENT_ID/reactions" \
  -f content="eyes"
```

We use 👀 (eyes / "seen") rather than 👍 because the reaction marks "processed," not "agreed" — Pushback or Clarify mean we processed the comment without agreeing.

If the reaction call fails (e.g., reaction already exists, network blip), log it and continue. Do **not** abort the run.

**Do not resolve threads.** Resolution is the reviewer's signal that they accept the fix.

### 8. Report

Print a summary using the subagent's `summary` field plus a per-item breakdown:

```
Addressed N unresolved items on PR #<num>:
  - <file:line> — Fixed (<change_summary>)          # inline thread
  - [conversation] @<author> — Fixed (<change_summary>)  # conversation item
  - <file:line> — Pushback (<reason>)
  - <file:line> — Clarify (<question>)
  - <file:line> — Already-fixed (<mechanism>)

Pushed: <branch> (<short_sha>)
PR: <url>
```

Include the subagent's `notes` field if non-empty.

## Hard Rules

- **Never resolve threads yourself.** Resolution status is the reviewer's tracking mechanism across reruns. If the user explicitly asks you to resolve, do it via the `resolveReviewThread` GraphQL mutation, but warn first that this short-circuits the reviewer's verification.
- **Never force-push** unless the user explicitly asks.
- **Never invent a reply.** Replies come from the subagent's `reply_body`, with only `<sha>` substitution.
- **Never skip verification.** A reply that says "fixed in abc123" pointing at a broken commit destroys reviewer trust.
- **Never trust `already-fixed` blind.** If the subagent claims a thread is already-fixed, spot-check by reading the cited file:line before accepting.

## Iteration Pattern

This skill is built to run repeatedly. An item is **actionable** when:

| Source               | Condition                                                           |
| -------------------- | ------------------------------------------------------------------- |
| Inline thread        | `isResolved == false` AND latest reviewer comment has no 👀 from us |
| Conversation comment | Comment author is not us AND comment has no 👀 from us              |

State transitions per item:

| Event                                                       | Effect on actionability                             |
| ----------------------------------------------------------- | --------------------------------------------------- |
| Reviewer (human or bot) posts initial comment               | Actionable (no 👀 yet)                              |
| Skill replies + 👀's the reviewer comment                   | Not actionable (👀 marker present)                  |
| Reviewer posts a follow-up                                  | Actionable again (new/updated comment, no 👀 on it) |
| Reviewer resolves thread (inline only; bots usually do not) | Not actionable forever                              |

Iteration loop:

1. You run the skill → subagent fixes + you verify, commit, push, reply. All addressed items become non-actionable.
2. Reviewer reads replies, verifies the SHA. Human reviewers resolve inline threads; bot reviewers usually do not — but the 👀 marker handles that for both sources.
3. Reviewer adds new comments on anything still wrong.
4. You rerun the skill → picks up only newly actionable items.
5. Repeat until the PR is approved.

Each iteration is one small fixup commit. Do not amend or force-push between iterations — the reviewer needs linear history to trust "fixed in `<sha>`."

## Edge Cases

| Situation                                                                              | Action                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer is a bot (`claude[bot]`, `coderabbit[bot]`, etc.) that never resolves threads | The 👀 marker handles this — once we 👀 the bot's comment, it drops out of the actionable filter. If the bot posts a _new_ comment later, no 👀 on it → actionable again next run. |
| Bot review comment contains many distinct issues                                       | The subagent addresses all of them as one item and returns a consolidated reply listing each fix.                                                                                  |
| Reviewer responds to our reply with a follow-up comment                                | Their new comment has no 👀 → actionable again next run. The subagent gets the full history and addresses the latest ask.                                                          |
| User wants to clear our 👀 to re-process an item                                       | They remove the 👀 reaction in the GitHub UI; next run picks it up.                                                                                                                |
| The reviewer pushes commits while you are working                                      | `git push` will fail; pull/rebase first, re-verify, then push. Do not silently force-push over their work.                                                                         |
| CODEOWNERS re-requests review on every push                                            | Normal — not a problem, just expected churn.                                                                                                                                       |
| Subagent returns `clarify` for everything                                              | The brief was probably underspecified or the comments are genuinely ambiguous; surface the questions to the user before posting them, in case the user can answer them directly.   |
| Subagent edits files unrelated to any item                                             | Reject and re-dispatch with a stricter prompt. The subagent must stay in scope.                                                                                                    |
| A conversation comment is a `@bot review` trigger (not reviewer feedback)              | Skip it — `@mention` trigger comments authored by a human PR participant calling a bot are not feedback to address. Only process comments authored by the reviewing bot itself.    |

## Integration

**Pairs with:**

- **`requesting-code-review`** — that skill dispatches a fresh review; this one closes the loop on review comments already received.
- **`build-and-test`** — must pass after fixes before pushing.

**Subagent:** `pr-comment-fixer` (definition in `agents/pr-comment-fixer.md`).

**Called by:** the user, manually, whenever new unresolved review comments appear on the active PR.
