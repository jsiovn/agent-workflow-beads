# Worktree setup (steps 6–9 of `executor-epic-sequential-worktree`)

Read this whole file before step 6 and follow every step in order. The step numbers match the main `SKILL.md`; placeholders (`<EPIC_BRANCH>`, `<WORKTREE_PATH>`, `<MAIN_ROOT>`, `<DEFAULT_BRANCH>`, `<EPIC_BEAD_ID>`, `<IMPLEMENTOR>`) are the values recorded in steps 2–5.

6. **Resolve the epic branch and make sure it exists on `origin`** so the worktree can always be cut from the up-to-date `origin/<EPIC_BRANCH>`. Probe and **record both results** (step 7 chooses its worktree-add command from `LOCAL_REF`, so do not skip recording it):
   - `LOCAL_REF` = does `git rev-parse --verify <EPIC_BRANCH>` succeed? (a local branch exists)
   - `ORIGIN_REF` = does `git ls-remote --exit-code --heads origin <EPIC_BRANCH>` succeed? (the branch is on origin)

   Then act on the combination:
   - **on origin (`ORIGIN_REF`=yes):** `git fetch origin <EPIC_BRANCH>` (this covers both "origin only" and "origin + local").
   - **local only (`ORIGIN_REF`=no, `LOCAL_REF`=yes):** push it so the worktree can branch from `origin/<EPIC_BRANCH>` (do not move or check out the local ref); now `ORIGIN_REF`=yes:
     ```
     git push -u origin <EPIC_BRANCH>:<EPIC_BRANCH>
     git fetch origin <EPIC_BRANCH>
     ```
   - **nowhere (`ORIGIN_REF`=no, `LOCAL_REF`=no):** create it from the latest default branch **without disturbing the main tree** (use `git branch`, which never touches the working tree), then push it; this sets both `LOCAL_REF`=yes and `ORIGIN_REF`=yes. Note in the final summary that the epic branch was created.
     ```
     git fetch origin <DEFAULT_BRANCH>
     git branch <EPIC_BRANCH> origin/<DEFAULT_BRANCH>
     git push -u origin <EPIC_BRANCH>
     git fetch origin <EPIC_BRANCH>
     ```

7. **Create the worktree checked out ON the epic branch** (not a new feature branch — every bead commits directly onto the epic branch), always anchored to the freshly fetched `origin/<EPIC_BRANCH>`. Choose strictly by the **recorded `LOCAL_REF`** (do not re-derive it):
   - **`LOCAL_REF`=no** (the branch exists only on origin, or was just pushed there): create the local tracking branch as part of the worktree add:
     ```
     git worktree add <WORKTREE_PATH> -b <EPIC_BRANCH> origin/<EPIC_BRANCH>
     ```
   - **`LOCAL_REF`=yes** (a local branch already existed, or you just created it with `git branch`): check it out into the worktree, then fast-forward it to the fetched origin tip so the run never starts from a stale local ref:
     ```
     git worktree add <WORKTREE_PATH> <EPIC_BRANCH>
     git -C <WORKTREE_PATH> merge --ff-only origin/<EPIC_BRANCH>
     ```
     If `merge --ff-only` fails (the local branch has diverged from origin), stop and ask — never force or rebase silently. (`merge --ff-only origin/<EPIC_BRANCH>` is used instead of `pull` so it needs no tracking config and deterministically lands on the up-to-date origin tip — picking the wrong command here is the difference between a clean start and either a hard `-b ... already exists` failure or committing the whole epic onto a stale tip that the final push then rejects non-fast-forward.)

   After this step there is a worktree at `<WORKTREE_PATH>` on a clean `<EPIC_BRANCH>` sitting at the `origin/<EPIC_BRANCH>` tip. **All remaining `git`/`bd`/`claude` work runs from inside `<WORKTREE_PATH>`** — the driver never `cd`s the main tree or switches its branch.

8. **Seed git-ignored local env files into the worktree — REQUIRED before any worker runs `build-and-test`.** A fresh worktree checks out only _tracked_ files, so git-ignored local config the build needs — `.env.local`, `.env`, and the rest of the `.env*` family — is absent, and the first worker's `build-and-test` would otherwise run against a worktree with no environment. Do this **once, up front, before the loop**, and unconditionally; do **NOT** skip or defer it on the assumption that `build-and-test` will synthesize a default environment. Run this from the main checkout (`<MAIN_ROOT>`); it reads from the main tree but never writes to it:

   ```
   git -C <MAIN_ROOT> ls-files --others --ignored --exclude-standard --directory \
     | grep -E '(^|/)\.env(\.[^/]*)?$' \
     | while IFS= read -r f; do
         mkdir -p "<WORKTREE_PATH>/$(dirname "$f")"
         cp -p "<MAIN_ROOT>/$f" "<WORKTREE_PATH>/$f"
       done
   ```

   - `--directory` collapses fully-ignored directories (`node_modules/`, `dist/`, `.beads/`, `*.db`) to a single entry so the `grep` skips them — only `.env*` files are copied, never dependencies or build output. `cp -p` preserves the source permissions (env files are often `600`).
   - Always **run** the detection command — never skip running it because you expect the output to be empty; only treat it as a no-op when its _actual_ output is empty. Never pre-judge that no `.env*` files exist because the worktree _looks_ build-ready (`.env.example` is tracked and proves nothing).
   - This `.env*` seed is the up-front, non-negotiable part. _Separately_, if a worker's `build-and-test` later fails because some **other** git-ignored config is missing (e.g. `.dev.vars`, a local service-account JSON), copy that one file the same way — but that reactive copy never replaces the up-front `.env*` seed above. Do not bulk-copy all ignored files.
   - **Do NOT seed `.beads/`, `*.db`, or `.dolt/` into the worktree** the way `.env*` is seeded. `bd` already resolves to the shared main-clone database (see step 9); copying beads state in would create a divergent or empty view — the exact failure to avoid. The `.env*` seed is the only thing copied into the worktree.

9. **Verify Beads health and connectivity inside the worktree.** The driver loop and every worker read and write bead state from within `<WORKTREE_PATH>`. This works because **`bd` is git-worktree-aware**: from inside a worktree it resolves `.beads` to the MAIN repo root via the git common dir and connects to the shared Dolt server, so the worktree and the main tree are **one** beads view (`.beads/dolt`, `issues.jsonl`, and `*.db` are git-ignored and deliberately not seeded into the worktree — see step 8).

   The authoritative health check is **`bd show <EPIC_BEAD_ID>`, not `bd where`**:

   ```
   (cd <WORKTREE_PATH> && bd show <EPIC_BEAD_ID> --json)
   ```

   - It must resolve the **same epic** AND prove the Dolt server is reachable. `bd where` only prints resolved config and **succeeds even when the server is down**, so it is not a connectivity check — rely on `bd show`.
   - **If `bd show` fails:** the most likely cause is the Dolt server being down — start it (`bd dolt start`; check `bd dolt status`) and retry. Do **not** reach for `bd bootstrap --yes` to "fix" a down server: it errors on shared-server reconcile, and in a healthy worktree it is only a no-op (it detects the existing main-clone DB). If `bd` is missing entirely, stop and report — the run cannot proceed without it.
   - **If `bd show` resolves a different or empty epic**, stop and report rather than running the loop against the wrong beads view.
   - **If `<IMPLEMENTOR>`=`opencode`:** confirm `<WORKTREE_PATH>/.opencode/agents/implementor.md` exists (it is committed, so it travels with `<EPIC_BRANCH>`). If missing, stop: run `agent-workflow-beads update --with-opencode <repo>`, commit `.opencode/agents/` onto the epic branch, and retry.
