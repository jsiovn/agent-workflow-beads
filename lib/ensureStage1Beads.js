'use strict';

// Port of scripts/shared/ensure_stage1_beads.py — ensure the stage-1 bootstrap
// follow-up beads exist exactly once. Dedup is by title, so re-running on an
// already-bootstrapped repo is a no-op.

const fs = require('fs');
const path = require('path');
const { runCapture } = require('./proc');

// Render the skill-update instructions.
function skillPaths(skill) {
  return `- update \`.claude/skills/${skill}/SKILL.md\``;
}

function screenshotsBead() {
  return {
    title: 'Specialize attach-web-screenshots for this repo',
    description: `Stage-1 bootstrap installed the generic attach-web-screenshots skill.

Create the repo-specific stage-2 specialization as a standalone bead:

## Goal
- fill in the two project-specific gaps left as placeholders in the generic skill:
  1. the command to start the preview server (step 3)
  2. the auth endpoint and User shape for the fetch mock (step 4)

## Requirements
- inspect \`package.json\` (scripts section) and any project README to find the correct preview command, port, and any required env flags (e.g. mock mode). Update step 3 in the skill with the concrete command
- inspect the project's auth API handler and User type to determine the correct endpoint path and response shape. Update step 4's \`<auth-endpoint>\` placeholder and the mock response object accordingly
- if the project has no auth-protected routes, remove step 4 entirely from the skill
${skillPaths('attach-web-screenshots')}

## Notes
- keep this bead independent; do not nest it under a feature epic
- do not hard-code credentials or secrets — the fetch mock only needs a valid shape, not real values
`,
  };
}

function buildAndTestBead() {
  return {
    title: 'Specialize build-and-test for this repo',
    description: `Stage-1 bootstrap installed the generic build-and-test skill.

Create the repo-specific stage-2 specialization as a standalone bead:

## Goal
- replace the generic stage-1 validation flow with project-specific build, run, and smoke-test steps

## Requirements
${skillPaths('build-and-test')}
- document any stable setup, launch, or verification steps the skill depends on

## Notes
- keep this bead independent; do not nest it under the first feature epic
- later epics may depend on this if stronger verification is needed
`,
  };
}

function ensureStage1Beads(repoPath) {
  const repo = path.resolve(repoPath);

  const beads = [buildAndTestBead()];
  // Only seed the screenshot specialization bead if that skill was installed.
  if (fs.existsSync(path.join(repo, '.claude', 'skills', 'attach-web-screenshots'))) {
    beads.unshift(screenshotsBead());
  }

  // --limit 0 is load-bearing: include closed beads and override the default
  // limit so a completed stage-1 bead is not re-created on repos with >50 issues.
  const listResult = runCapture('bd', ['list', '--all', '--limit', '0', '--json'], { cwd: repo });
  if (listResult.status !== 0) {
    process.stderr.write(listResult.stderr);
    throw new Error(`bd list failed with status ${listResult.status}`);
  }

  let issues;
  try {
    issues = JSON.parse(listResult.stdout || '[]');
  } catch (exc) {
    process.stderr.write(`Failed to parse \`bd list --json\`: ${exc.message}\n`);
    throw exc;
  }

  const existingTitles = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (issue && typeof issue === 'object' && issue.title) {
      existingTitles.set(issue.title, issue.id);
    }
  }

  let createdAny = false;
  for (const bead of beads) {
    if (existingTitles.has(bead.title)) {
      console.log(`Stage-1 follow-up bead already exists: ${existingTitles.get(bead.title)}`);
      continue;
    }
    const createResult = runCapture(
      'bd',
      [
        'create',
        '--type',
        'chore',
        '--priority',
        '2',
        '--labels',
        'bootstrap,stage-2',
        '--title',
        bead.title,
        '--description',
        bead.description,
      ],
      { cwd: repo },
    );
    if (createResult.status !== 0) {
      process.stderr.write(createResult.stderr);
      throw new Error(`bd create failed with status ${createResult.status}`);
    }
    createdAny = true;
    // Blank line to separate each created-bead block from the preceding output.
    console.log('');
    process.stdout.write(createResult.stdout);
  }

  if (!createdAny) {
    console.log('All stage-1 follow-up beads already exist.');
  }
}

module.exports = { ensureStage1Beads, screenshotsBead, buildAndTestBead, skillPaths };
