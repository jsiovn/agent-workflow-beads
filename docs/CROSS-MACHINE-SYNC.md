# Cross-Machine Beads Sync

Use this guide to share one repo's `bd` issues across multiple machines.

By default the template installs `bd` with Dolt in **local-only** mode: `.beads/dolt/`
is git-ignored and nothing leaves the machine until you push. To work on the same
issue database from a second machine, push it to a **Dolt remote**. The remote is
the project's **own git repo** (`origin`): Dolt stores the database under a hidden
ref in that repo, so you do not need a second repo.

Verified with `bd 1.3.4` and `dolt 2.1.11` on Windows, against a local `file://`
git remote, from a non-interactive shell. The `y/N` prompt and the error messages
quoted below are from that setup.

## How it works

- `bd dolt push` writes the database to `refs/dolt/data` in `origin`. That ref is
  not a branch, and `git clone` / `git fetch` never download it.
- The first push also creates a small branch, `__dolt_remote_info__`, holding a
  `DOLT_REMOTE.md` pointer file. Dolt updates it on every push, and `git clone`
  fetches it as `origin/__dolt_remote_info__`. It is expected — do not delete it.
  No other branch is touched.
- `.beads/dolt/` (the local database) stays git-ignored and per-machine.
- The remote address is **not** per-machine state. bd records it as `sync.remote`
  in `.beads/config.yaml`, which is tracked, so it travels through git with the
  rest of the repo. bd writes and commits it in one of two ways:
  - **`origin` existed when you bootstrapped:** `bd init` already wired the Dolt
    remote `origin` and committed `sync.remote` in its `bd init` commit. A plain
    `bd dolt push` publishes right away, with no prompt.
  - **`origin` was added later:** there is no Dolt remote yet. `bd dolt push` asks
    `y/N` before adopting the git origin (or fails closed when not run in a
    terminal), and on consent commits `.beads/config.yaml` as
    `bd: update sync.remote` on the current branch.
- The issues get the repo's visibility and write access: anyone who can clone the
  repo can read them, and anyone who can push can rewrite them. **A public repo
  means public issues.** If the repo is public, use a separate private repo as the
  Dolt remote instead — `bd dolt remote remove origin` (if already wired), then
  `bd dolt remote add origin <private-url>`; not covered further here — and do not
  push or install the hooks below until you have.

## One-time: publish the database (first machine)

Prerequisite: `origin` points at the GitHub repo and has at least one pushed
branch (`git push -u origin main`). Do this on the default branch so the config
commit lands where every clone gets it.

1. Check whether the Dolt remote is already wired:
   ```bash
   bd dolt remote list
   ```
   `origin  git+ssh://…` means it is (origin existed at bootstrap).
   `No remotes configured.` means step 2 will adopt it.
2. Push:
   ```bash
   bd dolt push          # wired: pushes. Not wired: asks y/N (answer y).
   bd dolt push --yes    # not wired, non-interactive shell: consent up front
   ```
3. Verify the database landed:
   ```bash
   git ls-remote origin refs/dolt/data   # prints one SHA
   ```
4. Push the commit that carries `sync.remote` — the `bd init` commit (wired case)
   or the `bd: update sync.remote` commit step 2 just made (adopted case). Without
   it, other clones cannot find the database:
   ```bash
   git push
   git show origin/<branch>:.beads/config.yaml | grep -A1 '^sync:'   # shows remote:
   ```

Do not run `bd dolt remote add origin <origin-url>`: bd refuses a URL that matches
the git origin. Let `bd init` or `bd dolt push` derive it.

### SSH host alias caveat

bd derives the Dolt URL from the git origin — `git@github.com-<account>:<owner>/<repo>.git`
becomes `git+ssh://git@github.com-<account>/<owner>/<repo>.git`, an `https://` origin
becomes `git+https://…` — and the origin URL is committed as `sync.remote`. So every
machine must resolve the **same** host. A GitHub SSH key belongs to exactly one
account; if the machine's default `github.com` key is the wrong account, define a
host alias in `~/.ssh/config` and use it in the origin URL:

```
Host github.com-<account>
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_<account>
```

Pick **one alias name** and define it on every machine. Dolt cannot answer
credential prompts: load SSH keys with `ssh-add`, and give HTTPS origins a
credential helper or token.

## Per-machine: join the database (every other machine)

1. Ensure the SSH key + `~/.ssh/config` alias from above exist on this machine.
2. Install the CLI (`npm install -g agent-workflow-beads`), clone the repo after
   the setup above is pushed, and join the database:
   ```bash
   git clone <origin-url> <dir>
   agent-workflow-beads join <dir>
   cd <dir> && bd ready
   ```
   `join` checks that `.beads/config.yaml` has a `sync.remote`, then runs
   `bd init --skip-agents --skip-hooks --non-interactive`, which clones the
   database from `refs/dolt/data` and wires `origin` for later push/pull. It makes
   no commit; `git status` stays clean. Running it again is harmless: a clone that
   already has the database is left alone.

Why a command and not plain `bd`:

- `bd init` only joins an **untouched** clone. Any earlier `bd` command starts a
  Dolt server whose empty workspace `bd init` then rejects (`Aborting.` or
  `legacy Dolt server workspace detected`) — and opening Claude Code in the clone
  counts, because its committed `.claude/settings.json` has a `SessionStart` hook
  that runs `bd prime`. `join` detects that workspace (no database directory under
  `.beads/dolt/` yet, so no issues in it), stops this clone's server, deletes it,
  and then runs `bd init`.
- `bd bootstrap`, which bd's own hint suggests, fails on an untouched clone in
  server mode: `failed to reconcile shared-server metadata: dial tcp 127.0.0.1:0`.
- Plain `bd init` without the flags joins too, but commits `AGENTS.md`,
  `.codex/`, `.cursor/` and `.beads/hooks/` files on your branch.
- Re-running the template's `agent-workflow-beads bootstrap` joins as well, but
  rewrites workflow files the clone already has; `update` is the command for that.

Without the CLI, the equivalent is `bd init --skip-agents --skip-hooks
--non-interactive` as the first `bd` command in the clone, before opening Claude
Code there.

## Daily routine

| When                          | Command                      |
| ----------------------------- | ---------------------------- |
| Before leaving a machine      | `bd dolt push`               |
| Arriving on the other machine | `bd dolt pull`, then `bd ready` |

Dolt does cell-level merge, so the only rule is: do not edit the **same** issue on
two machines without a `push` / `pull` between them. A push rejected as
`non-fast-forward` means the other machine pushed first: `bd dolt pull`, then push.

## Switching from a dedicated `<repo>-beads` remote

Older versions of this guide used a separate private `<repo>-beads` repo. To move
the database into the project's own repo:

1. On every machine, `bd dolt push` to the old remote. Then, on the machine that
   will migrate, `bd dolt pull` so it has everything.
2. On that machine, on the default branch:
   ```bash
   bd dolt remote remove origin   # commits "bd: clear sync.remote"
   bd dolt push --yes             # adopts git origin, pushes the full history,
                                  # commits "bd: update sync.remote"
   git push
   ```
3. On every other machine, take a **fresh clone** and follow the per-machine
   section. Re-pointing an existing clone in place works but is noisy:
   `bd dolt remote remove` commits a cleared `sync.remote` over the one you pulled,
   and re-adopting commits it again — two extra config commits on your branch.

After that the `<repo>-beads` repo is no longer used; archive it when every
machine has switched.

## Optional: automate push/pull with Claude Code hooks

You can let Claude Code run the sync for you with `SessionStart` and `SessionEnd`
hooks. Add this to the repo's `.claude/settings.local.json` — that file is
git-ignored, so the hook stays machine-local even though the remote address
travels with the repo. Set it up once per machine:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && bd dolt pull || true"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && bd dolt push || true"
          }
        ]
      }
    ]
  }
}
```

What this does:

- **`SessionStart`** (`startup`/`resume`) pulls the latest issues before you begin.
- **`SessionEnd`** pushes your changes when the session ends.

Caveats — read before relying on it:

- `cd "$CLAUDE_PROJECT_DIR"` is required: hooks run from Claude's current working
  directory, and `bd dolt` must run inside the repo.
- `|| true` keeps a failed sync from surfacing as a hook error. `SessionStart` and
  `SessionEnd` cannot block the session anyway, but a network failure should be a
  warning, not noise.
- A failed `SessionStart` pull means you start with **stale issues** — if the
  network was down, run `bd dolt pull` manually once it is back.
- `SessionEnd` does **not** fire on an abrupt kill (crash, `kill -9`, closed
  terminal). Treat the hook as a convenience, not a guarantee — keep a manual
  `bd dolt push` in your habits before switching machines.
- These commands assume the Dolt server is running. If `bd dolt` reports the server
  is down, start it first (`bd dolt start`).
- Do **not** push on the `Stop` event — it fires after every assistant turn and
  would hammer the remote. `SessionEnd` (once per session) is the right granularity.

- `.claude/settings.local.json` is git-ignored and does **not** travel with the
  repo — add it on each machine you want auto-sync on.
- What the hook does without a configured Dolt remote: with no git origin either,
  `bd dolt pull` / `push` print `No remote is configured — skipping.` and exit 0.
  With a git origin but no Dolt remote, `pull` still skips, and `push` refuses to
  adopt the origin without consent and exits 1 — the hook cannot start publishing
  by itself.
- If `origin` existed at bootstrap, the Dolt remote is **already wired**, so the
  `SessionEnd` hook publishes on its first run. On a public repo, that makes the
  issues public.
