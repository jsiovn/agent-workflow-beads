# Troubleshooting

## Current checkout cannot find the Beads database

Symptoms:

- `bd where` fails in the current checkout
- `bd ready` or `bd show` says the database is missing
- `bd context` shows stale server details

Fix:

1. Check the Beads context from the current checkout:

   ```bash
   bd where
   bd context
   ```

2. Repair the repo-local Beads state:

   ```bash
   bd bootstrap --yes
   ```

## Local Dolt server endpoint changed

Symptoms:

- `bd where` or `bd ready` warns that the Dolt server port changed
- the current checkout is pointing at stale local server info

Fix:

1. Check server state:

   ```bash
   bd dolt status
   bd context
   ```

2. If the checkout is unhealthy, run:

   ```bash
   bd bootstrap --yes
   bd doctor
   ```

## Old `br` artifacts remain after rollback

Symptoms:

- `.beads/redirect` points to an old `*.shared/_beads` path
- `br`-era files like `.br_history/` remain under `.beads`

Fix:

1. Re-run the rollback scaffold or migration script for the repo.
2. Confirm the repo now uses `bd`:

   ```bash
   bd where
   bd ready --json
   ```

3. Ignore or remove archived `br` backups under `.beads/backup/` if they are no longer needed.

## Upgrading `bd` to 1.3.x

The workflow skills need `bd` 1.3.0 or newer. `agent-workflow-beads check` warns on
older versions.

1. Back up first: `bd export --all -o beads-backup.jsonl`.
2. bd 1.3.0 migrates the schema on first run. A **shared** Dolt sql-server is never
   migrated automatically: run `bd migrate schema` against it explicitly.
3. If the workspace went through bd 1.3.2's blocked-state migration, run
   `bd recompute-blocked` once in it so `bd ready` reflects the right blocked set.
4. bd 1.3.3: do not run `bd compact` or `bd flatten` on a clone that picked up the
   migration through `bd dolt pull` or `bd bootstrap` (upstream known issue
   gastownhall/beads#7039). `bd rules compact` now needs `--force` to apply.

Symptoms of an outdated `bd`:

- `bd ready --json --brief` fails with an unknown-flag error
- `bd update <id> --claim` fails with an unknown-flag error

Fix: upgrade `bd` (see [INSTALL.md](INSTALL.md)). Until then, drop `--brief` and use
`bd update <id> --status in_progress` instead of `--claim`.
