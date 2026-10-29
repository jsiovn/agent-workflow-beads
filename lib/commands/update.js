'use strict';

// Port of scripts/posix/update-skills.sh — refresh the shared workflow surface in
// an existing downstream repo and ensure the stage-1 follow-up beads exist.

const path = require('path');

const { checkPrereqs } = require('../prereqs');
const { scaffold } = require('../scaffold');
const { ensureStage1Beads } = require('../ensureStage1Beads');

function update(repoPath, options = {}) {
  const repo = path.resolve(repoPath);

  checkPrereqs();
  scaffold(repo, {
    withScreenshots: Boolean(options.withScreenshots),
    withOpencode: Boolean(options.withOpencode),
  });
  ensureStage1Beads(repo);

  console.log(`Skills synced to ${repo}`);
}

module.exports = { update };
