'use strict';

// Join an existing beads database from another machine: run in a fresh clone of
// a repo whose first machine already ran `bd dolt push` and pushed the commit
// that records `sync.remote` in .beads/config.yaml (see CROSS-MACHINE-SYNC.md).
//
// `bd init --skip-agents --skip-hooks --non-interactive` is the only bd command
// that joins an untouched clone (bd 1.3.4: `bd bootstrap` fails there with
// "dial tcp 127.0.0.1:0"). Any earlier bd command — including the `bd prime`
// SessionStart hook Claude Code runs on open — starts a Dolt server whose empty
// workspace `bd init` then rejects. Such a workspace holds no data until the
// database directory `.beads/dolt/<dolt_database>/` exists, so join resets it
// (stops this clone's server, deletes it) and runs `bd init` on a clean slate.

const fs = require('fs');
const path = require('path');

const { checkPrereqs } = require('../prereqs');
const { rmrf } = require('../fsx');
const { runCapture, runInherit } = require('../proc');

const INIT_ARGS = ['init', '--skip-agents', '--skip-hooks', '--non-interactive'];

// The uncommented `remote:` under the top-level `sync:` key, or null.
function readSyncRemote(configText) {
  const lines = configText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^sync:\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^\S/.test(line)) break; // next top-level key
      const m = line.match(/^\s+remote:\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '') || null;
    }
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// Image name of a live PID, so a recycled PID in a stale pid file is never killed.
function processName(pid) {
  if (process.platform === 'win32') {
    const res = runCapture('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    const m = res.stdout.match(/^"([^"]+)"/m);
    return m ? m[1] : '';
  }
  return runCapture('ps', ['-p', String(pid), '-o', 'comm=']).stdout.trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Stop this clone's own Dolt server. `bd dolt stop` refuses in the "legacy
// workspace" state, so fall back to the PID bd recorded — only if it is dolt.
function stopCloneServer(beadsDir, repo) {
  runCapture('bd', ['dolt', 'stop'], { cwd: repo });
  const pidFile = path.join(beadsDir, 'dolt-server.pid');
  const pid = Number.parseInt(fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8') : '', 10);
  if (!Number.isInteger(pid) || pid <= 0 || !isAlive(pid)) return;
  if (!/dolt/i.test(processName(pid))) return;
  process.kill(pid);
  for (let i = 0; i < 50 && isAlive(pid); i++) sleep(100);
  if (isAlive(pid)) {
    throw new Error(`could not stop this clone's Dolt server (PID ${pid}); stop it and rerun join`);
  }
}

// Windows can hold file locks for a moment after the server exits.
function removeWithRetry(target) {
  for (let i = 0; ; i++) {
    try {
      rmrf(target);
      return;
    } catch (err) {
      if (i >= 20 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err.code)) throw err;
      sleep(250);
    }
  }
}

function resetEmptyWorkspace(beadsDir, repo) {
  console.log('Resetting the empty Dolt workspace an earlier bd command started (it holds no issues)');
  stopCloneServer(beadsDir, repo);
  const entries = fs.readdirSync(beadsDir);
  const targets = ['dolt', 'dolt.gate.lock', ...entries.filter((e) => e.startsWith('dolt-server.'))];
  for (const name of targets) removeWithRetry(path.join(beadsDir, name));
}

function join(repoPath) {
  const repo = path.resolve(repoPath);
  checkPrereqs();

  if (runCapture('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']).status !== 0) {
    throw new Error(`${repo} is not a git checkout — git clone the repo first`);
  }
  const beadsDir = path.join(repo, '.beads');
  const metadata = readJson(path.join(beadsDir, 'metadata.json'));
  const configPath = path.join(beadsDir, 'config.yaml');
  if (!metadata || !fs.existsSync(configPath)) {
    throw new Error(
      `${repo} has no committed .beads/ setup — run agent-workflow-beads bootstrap on the first machine`,
    );
  }
  const remote = readSyncRemote(fs.readFileSync(configPath, 'utf8'));
  if (!remote) {
    throw new Error(
      [
        '.beads/config.yaml has no sync.remote, so there is no shared database to join.',
        'On the first machine: bd dolt push, then git push the commit that records',
        'sync.remote; then git pull here and rerun join.',
      ].join('\n'),
    );
  }

  console.log(`Repo:    ${repo}`);
  console.log(`Remote:  ${remote}`);

  // A database lives in a non-dot subdirectory of .beads/dolt/; the server's own
  // workspace is only dot entries (.dolt/, .doltcfg/, .bd-dolt-ok).
  const doltDir = path.join(beadsDir, 'dolt');
  const databases = fs.existsSync(doltDir)
    ? fs.readdirSync(doltDir).filter((name) => !name.startsWith('.'))
    : [];
  if (databases.length > 0) {
    const joined = databases.includes(metadata.dolt_database);
    console.log(
      joined
        ? `This clone already has the ${metadata.dolt_database} database — nothing to join.`
        : `This clone already has a local database (.beads/dolt/${databases.join(', ')}); join leaves it alone.`,
    );
    console.log('Check it with: bd dolt remote list, then bd dolt pull');
    if (!joined) process.exitCode = 1;
    return;
  }
  if (fs.existsSync(doltDir)) resetEmptyWorkspace(beadsDir, repo);

  runInherit('bd', INIT_ARGS, { cwd: repo });

  console.log('');
  console.log('✅ Joined. Daily: bd dolt pull on arrival, bd dolt push before leaving.');
  console.log(`   cd ${repo} && bd ready`);
}

module.exports = { join, readSyncRemote };
