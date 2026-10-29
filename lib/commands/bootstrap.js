'use strict';

// Port of scripts/posix/bootstrap-new-repo.sh — initialize a new downstream repo:
// prereq check, git init, `bd` setup, scaffold, and stage-1 follow-up beads.

const path = require('path');

const { checkPrereqs } = require('../prereqs');
const { mkdirp } = require('../fsx');
const { runCapture, runInherit } = require('../proc');
const { scaffold } = require('../scaffold');
const { ensureStage1Beads } = require('../ensureStage1Beads');

function bootstrap(repoPath, prefix, options = {}) {
  const repo = path.resolve(repoPath);
  const withScreenshots = Boolean(options.withScreenshots);
  const withOpencode = Boolean(options.withOpencode);

  checkPrereqs({ requireOpencode: withOpencode });

  mkdirp(repo);

  const insideWorktree = runCapture('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
  if (insideWorktree.status !== 0) {
    runInherit('git', ['-C', repo, 'init']);
    console.log('Initialized git repository');
  }

  console.log(`Repo:    ${repo}`);
  console.log(`Prefix:  ${prefix}`);
  console.log(
    `AI:      ${withOpencode ? 'Claude Code (primary) + OpenCode implementor' : 'Claude Code (primary)'}`,
  );

  // --non-interactive answers init's prompts with sensible defaults: role =
  // maintainer (i.e. "N" to "Contributing to someone else's repo?").
  runInherit(
    'bd',
    ['init', '-p', prefix, '--server', '--skip-agents', '--skip-hooks', '--non-interactive'],
    { cwd: repo },
  );
  // Beads state is local-only in this workflow (code moves through git, not bd
  // exports), so disable auto-export — it otherwise writes and auto-stages
  // .beads/issues.jsonl on every write. This is the "n" to "Enable auto-export?".
  runInherit('bd', ['config', 'set', 'export.auto', 'false'], { cwd: repo });
  // Claude Code is the primary AI and is always set up. There is deliberately no
  // `bd setup opencode`: it writes an AGENTS.md section, and OpenCode prefers
  // AGENTS.md over CLAUDE.md, so it would shadow the managed CLAUDE.md block.
  runInherit('bd', ['setup', 'claude'], { cwd: repo });

  scaffold(repo, { withScreenshots, withOpencode });
  ensureStage1Beads(repo);
  console.log('');
  console.log('✅ Bootstrap complete.');
  printCommitGuidance(repo);
  printDoltRemoteGuidance(prefix);
}

// `bd init` commits its own `.beads/` scaffolding, but the shared workflow surface
// (CLAUDE.md, .claude/, skills, agents, …) is written by scaffold and left
// uncommitted. Guide the developer to commit it themselves.
function printCommitGuidance(repo) {
  console.log('');
  console.log('📝 Next — review and commit the scaffolded workflow files:');
  console.log(`     cd ${repo}`);
  console.log('     git status');
  console.log('     git add -A');
  console.log('     git commit -m "chore: add agent-workflow-beads workflow surface"');
}

// Optional next step: back the beads DB with a GitHub-hosted Dolt remote so the
// issue database can be shared across machines (full flow in CROSS-MACHINE-SYNC.md).
function printDoltRemoteGuidance(prefix) {
  const repoName = `${prefix}-beads`;
  console.log('');
  console.log(
    '🌐 Optional — share this repo’s beads across machines via a GitHub-backed Dolt remote:',
  );
  console.log(
    `   1️⃣  Create a PRIVATE GitHub repo to back the DB (e.g. ${repoName}) and seed one commit.`,
  );
  console.log('   2️⃣  Attach it as the Dolt remote and push (use an SSH host alias if your');
  console.log('       default github.com key is the wrong account):');
  console.log(`        bd dolt remote add origin git+ssh://git@github.com/<owner>/${repoName}.git`);
  console.log('        bd dolt push');
  console.log('   🔁 Other machines: bd dolt remote add origin <same-url> && bd dolt pull');
  console.log(
    '   📖 Full guide: https://github.com/jsiovn/agent-workflow-beads/blob/main/docs/CROSS-MACHINE-SYNC.md',
  );
}

module.exports = { bootstrap };
