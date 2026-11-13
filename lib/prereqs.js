'use strict';

// Port of scripts/posix/check-prereqs.sh. Python is no longer required (the
// scaffold logic is native Node now), so it is not checked.

const { which } = require('./which');

// Optional CLIs: checked only when their flag is passed, and only warned about,
// since the converted agents are plain files that need no CLI to be written.
function checkPrereqs(options = {}) {
  const missing = [];

  for (const cmd of ['git', 'bd', 'dolt']) {
    if (!which(cmd)) missing.push(cmd);
  }

  if (options.withOmp && !which('omp')) {
    process.stderr.write('warning: omp is not on PATH\n');
  }
  if (options.withOpencode && !which('opencode')) {
    process.stderr.write('warning: opencode is not on PATH\n');
  }

  if (missing.length > 0) {
    process.stderr.write(`missing required commands: ${missing.join(' ')}\n`);
    throw new Error(`missing required commands: ${missing.join(' ')}`);
  }

  console.log('Required commands found: git, bd, dolt');
}

module.exports = { checkPrereqs };
