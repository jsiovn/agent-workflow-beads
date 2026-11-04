# Cross-Machine Beads Sync

Use this guide to share one repo's `bd` issues across multiple machines.

By default the template installs `bd` with Dolt in **local-only** mode: `.beads/dolt/`
is git-ignored and nothing leaves the machine. To work on the same issue database
from a second machine you attach a **Dolt remote**. Beads syncs through that remote —
**not** through git, and not through the downstream project's repo.

## How it works

- The Dolt remote is stored inside `.beads/dolt/`, which the template `.gitignore`
  ignores. So the remote is **per-clone, per-machine local state** — exactly like
  `.beads/workflow/runtime-target.json`.
- It does **not** travel with the project repo or with this template. Every machine
  must attach the remote itself (one-time, see below).
- The actual issue database lives in the remote under a hidden `refs/dolt/data` git
  ref. The remote repo's default branch only holds a small `DOLT_REMOTE.md` pointer
  file — that is expected, not a failed push.

## One-time: create the remote (do once, on the first machine)

1. Create a **private** GitHub repo to back the database, e.g. `<repo>-beads`.
   Private GitHub repos are free; DoltHub charges for private databases.
2. Seed it with an initial commit — Dolt's `git+ssh` remote needs an existing
   branch to push to:
   ```bash
   gh api -X PUT repos/<owner>/<repo>-beads/contents/README.md \
     -f message="chore: initialize repo" \
     -f content="$(printf 'Beads (Dolt) issue database. Managed by bd dolt push/pull.\n' | base64 -w0)"
   ```
3. Attach the remote and push:
   ```bash
   bd dolt remote add origin git+ssh://git@<ssh-host>/<owner>/<repo>-beads.git
   bd dolt push
   bd dolt remote list   # verify
   ```

### SSH host alias caveat

The remote URL embeds an SSH host. A GitHub SSH key belongs to exactly one account,
so if the machine's default `github.com` key is the wrong account, define a host
alias in `~/.ssh/config` and use it in the URL (`git@github.com-<account>`):

```
Host github.com-<account>
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_<account>
```

Pick **one alias name** and use it consistently — the alias is part of the remote
URL, so every machine must define the same alias for `bd dolt pull` to resolve.

## Per-machine: attach an existing remote (every other machine)

On each additional machine, after the repo is bootstrapped from this template:

1. Ensure the SSH key + `~/.ssh/config` alias from above exist on this machine.
2. Attach the remote and pull:
   ```bash
   bd dolt remote add origin git+ssh://git@<ssh-host>/<owner>/<repo>-beads.git
   bd dolt pull
   bd ready
   ```

## Daily routine

| When                          | Command                      |
| ----------------------------- | ---------------------------- |
| Before leaving a machine      | `bd dolt push`               |
| Arriving on the other machine | `bd dolt pull`, then `bd ready` |

Dolt does cell-level merge, so the only rule is: do not edit the **same** issue on
two machines without a `push` / `pull` between them.

## Optional: automate push/pull with Claude Code hooks

You can let Claude Code run the sync for you with `SessionStart` and `SessionEnd`
hooks. Add this to the repo's `.claude/settings.local.json` — that file is
git-ignored, so the hook stays machine-local, consistent with the Dolt remote
itself being per-machine state. Set it up once per machine:

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
  is down, start it first (`bd dolt start` or `bd`'s server command for your setup).
- `bd setup claude` (run by `bootstrap`) registers its own `SessionStart` hook
  (`bd prime --hook-json`) in `.claude/settings.json`; since bd 1.3 it no longer adds a
  `PreCompact` one, because `SessionStart` also fires after compaction. Your sync hooks
  in `settings.local.json` run alongside it.
- Do **not** push on the `Stop` event — it fires after every assistant turn and
  would hammer the remote. `SessionEnd` (once per session) is the right granularity.

- `.claude/settings.local.json` is git-ignored and does **not** travel with the
  repo — add it on each machine you want auto-sync on. If a machine has no Dolt
  remote configured, `bd dolt pull` / `push` simply warn and exit non-zero; with
  `|| true` the hook stays harmless.
