'use strict';

// Port of scripts/posix/check-prereqs.sh. Python is no longer required (the
// scaffold logic is native Node now), so it is not checked.

const { which } = require('./which');

function checkPrereqs() {
  const missing = [];

  for (const cmd of ['git', 'bd', 'dolt']) {
    if (!which(cmd)) missing.push(cmd);
  }

  if (missing.length > 0) {
    process.stderr.write(`missing required commands: ${missing.join(' ')}\n`);
    throw new Error(`missing required commands: ${missing.join(' ')}`);
  }

  console.log('Required commands found: git, bd, dolt');
}

module.exports = { checkPrereqs };
