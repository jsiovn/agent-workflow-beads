'use strict';

// Port of scripts/shared/manage_gitignore.py — maintain the managed `.gitignore`
// block in a downstream repo. Only machine-local runtime artifacts are ignored;
// the rest of the workflow surface (including docs/plans/) is committed
// downstream. Idempotent: re-running replaces the block.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCapture } = require('./proc');

const IGNORE_BLOCK_START = '# BEGIN TEMPLATE AGENT WORKFLOW LOCAL-ONLY';
const IGNORE_BLOCK_END = '# END TEMPLATE AGENT WORKFLOW LOCAL-ONLY';
// Orphaned comment headers to drop from the downstream .gitignore. bd init writes
// its own "# Beads / Dolt files (added by bd init)" header + entries; our managed
// block already covers those entries, so the header is left stranded — strip it.
const STRIP_HEADERS = ['# Local agent workflow assets', '# Beads / Dolt files (added by bd init)'];

const IGNORE_ENTRIES = [
  '.beads-credential-key',
  '.beads/interactions.jsonl',
  '.beads/epic-runs',
  '.claude/scheduled_tasks.lock',
  '.claude/settings.local.json',
  '.bv/',
  '*.db',
  '.dolt/',
];

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveRepoRoot(p) {
  const candidate = path.resolve(expandHome(String(p)));
  const res = runCapture('git', ['-C', candidate, 'rev-parse', '--show-toplevel']);
  if (res.status !== 0) {
    return candidate;
  }
  return path.resolve(res.stdout.trim());
}

// Emulate Python str.splitlines(): split on line boundaries, dropping a single
// trailing empty element produced by a final newline.
function splitlines(s) {
  const parts = s.split(/\r\n|\r|\n/);
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts;
}

function stripIgnoreBlock(content) {
  const start = content.indexOf(IGNORE_BLOCK_START);
  const end = content.indexOf(IGNORE_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const endPos = end + IGNORE_BLOCK_END.length;
  const before = content.slice(0, start).replace(/[\r\n]+$/, '');
  const after = content.slice(endPos).replace(/^[\r\n]+/, '');
  if (before && after) {
    return before + '\n\n' + after;
  }
  return before || after;
}

function squashBlankRuns(lines) {
  const squashed = [];
  let blank = false;
  for (const line of lines) {
    if (line.trim()) {
      squashed.push(line.replace(/\s+$/, ''));
      blank = false;
      continue;
    }
    if (!blank) {
      squashed.push('');
    }
    blank = true;
  }
  while (squashed.length && squashed[0] === '') {
    squashed.shift();
  }
  while (squashed.length && squashed[squashed.length - 1] === '') {
    squashed.pop();
  }
  return squashed;
}

function ensureIgnoreBlock(repoRoot) {
  const target = path.join(repoRoot, '.gitignore');
  const content = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const stripped = stripIgnoreBlock(content);

  const managed = new Set(IGNORE_ENTRIES);
  let filtered = [];
  for (const line of splitlines(stripped)) {
    const raw = line.replace(/\r+$/, '');
    if (STRIP_HEADERS.includes(raw)) continue;
    if (managed.has(raw)) continue;
    filtered.push(raw);
  }
  filtered = squashBlankRuns(filtered);

  const blockLines = [IGNORE_BLOCK_START, ...IGNORE_ENTRIES, IGNORE_BLOCK_END];
  const merged = [...filtered, ...(filtered.length ? [''] : []), ...blockLines].join('\n') + '\n';

  if (merged === content) {
    return false;
  }
  fs.writeFileSync(target, merged, 'utf8');
  return true;
}

// Entry point mirroring `manage_gitignore.py ensure-ignore --repo <path>`.
function ensureIgnore(repoPath) {
  const repoRoot = resolveRepoRoot(repoPath);
  const changed = ensureIgnoreBlock(repoRoot);
  return { repoRoot, changed };
}

module.exports = {
  ensureIgnore,
  ensureIgnoreBlock,
  resolveRepoRoot,
  IGNORE_ENTRIES,
  IGNORE_BLOCK_START,
  IGNORE_BLOCK_END,
};
