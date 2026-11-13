'use strict';

// Port of scripts/posix/update-skills.sh — refresh the shared workflow surface in
// an existing downstream repo and ensure the stage-1 follow-up beads exist.

const path = require('path');

const { checkPrereqs } = require('../prereqs');
const { scaffold } = require('../scaffold');
const { ensureStage1Beads } = require('../ensureStage1Beads');
const { agentSurfaces } = require('./bootstrap');

function update(repoPath, options = {}) {
  const repo = path.resolve(repoPath);
  const scaffoldOptions = {
    withScreenshots: Boolean(options.withScreenshots),
    withOmp: Boolean(options.withOmp),
    withOpencode: Boolean(options.withOpencode),
  };

  checkPrereqs(scaffoldOptions);
  const installed = scaffold(repo, scaffoldOptions);
  ensureStage1Beads(repo);

  console.log(`Agents synced: ${agentSurfaces(installed)}`);
  console.log(`Skills synced to ${repo}`);
}

module.exports = { update };
