'use strict';

// Port of scripts/posix/scaffold-repo-files.sh (and its .ps1 twin) — the core
// copier that writes the shared workflow surface into a downstream repo. Order
// and behavior mirror the shell script exactly.

const fs = require('fs');
const path = require('path');

const { ASSET_ROOT } = require('./paths');
const {
  mkdirp,
  rmrf,
  rmdirIfEmpty,
  copyFile,
  recursiveCopy,
  listDirs,
  listFiles,
} = require('./fsx');
const manageGitignore = require('./manageGitignore');
const manageInstructions = require('./manageInstructions');

// Skills retired in a previously published version, pruned from .claude/skills
// so existing downstreams clean up on their next `update`. Add a name here
// whenever a shipped skill is removed.
const LEGACY_SKILLS = ['implement-with-opencode'];

// The OpenCode implementor agent that 1.2.0 scaffolded into
// .opencode/agents/implementor.md. It is deleted only when it still carries this
// template marker, so a downstream's own implementor.md is never touched.
const LEGACY_OPENCODE_IMPLEMENTOR = path.join('.opencode', 'agents', 'implementor.md');
const LEGACY_OPENCODE_IMPLEMENTOR_MARKER = 'IMPLEMENTOR: done|blocked';

// Downstream files retired in a previously published version, scrubbed without
// touching a downstream's own scripts/. Empty for the initial npm release — add a
// path here whenever a future version stops shipping a downstream file.
const LEGACY_SCRIPT_PATHS = [];

const log = (msg) => console.log(msg);
const exists = (p) => fs.existsSync(p);

// Copy build-and-test / attach-web-screenshots from templates/skills into a
// provider's skills dir, preserving an existing copy (downstream specialization).
function copyStage1Skill(srcDir, dstDir, label) {
  if (!exists(dstDir)) {
    recursiveCopy(srcDir, dstDir);
    log(`Copied ${label}`);
  } else {
    log(`Preserved existing ${label}`);
  }
}

// Mirror every shared skill in skills/ into <provider>/skills (replace each).
function copySharedSkills(skillsSrc, providerSkillsDir, providerLabel) {
  for (const name of listDirs(skillsSrc)) {
    const dst = path.join(providerSkillsDir, name);
    rmrf(dst);
    recursiveCopy(path.join(skillsSrc, name), dst);
    log(`Copied ${providerLabel} skill: ${name}`);
  }
}

function scaffold(repoPath, options = {}) {
  const repo = path.resolve(repoPath);
  let withScreenshots = Boolean(options.withScreenshots);

  // Auto-detect an existing screenshot install so `update` refreshes it without
  // requiring the flag every time.
  if (exists(path.join(repo, '.claude', 'skills', 'attach-web-screenshots'))) {
    withScreenshots = true;
  }
  // Claude Code, OpenCode and omp all read .claude/skills/, so there is no
  // per-CLI surface. Codex support was removed: a downstream's .codex/ is left
  // untouched (never read or written).

  const templates = path.join(ASSET_ROOT, 'templates');
  const skillsSrc = path.join(ASSET_ROOT, 'skills');
  const agentsSrc = path.join(ASSET_ROOT, 'agents');
  const buildSkillSrc = path.join(templates, 'skills', 'build-and-test');
  const attachSkillSrc = path.join(templates, 'skills', 'attach-web-screenshots');

  mkdirp(repo);

  copyFile(path.join(templates, 'BEADS_WORKFLOW.md'), path.join(repo, 'BEADS_WORKFLOW.md'));
  log('Copied BEADS_WORKFLOW.md');

  const beadsDir = path.join(repo, '.beads');
  mkdirp(beadsDir);
  copyFile(path.join(templates, 'PRIME.md'), path.join(beadsDir, 'PRIME.md'));
  // The in-package asset is stored as beads.gitignore because npm refuses to pack
  // a file whose basename is `.gitignore`; it is written to the dotted name here.
  copyFile(path.join(templates, '.beads', 'beads.gitignore'), path.join(beadsDir, '.gitignore'));
  copyFile(path.join(templates, '.beads', 'README.md'), path.join(beadsDir, 'README.md'));
  log('Copied .beads/PRIME.md');
  log('Copied .beads/.gitignore');
  log('Copied .beads/README.md');

  // --- Claude skills (always — Claude Code is the primary AI) ---
  const claudeSkills = path.join(repo, '.claude', 'skills');
  mkdirp(claudeSkills);
  copyStage1Skill(
    buildSkillSrc,
    path.join(claudeSkills, 'build-and-test'),
    'Claude build-and-test skill',
  );
  if (withScreenshots) {
    copyStage1Skill(
      attachSkillSrc,
      path.join(claudeSkills, 'attach-web-screenshots'),
      'Claude attach-web-screenshots skill',
    );
  }
  copySharedSkills(skillsSrc, claudeSkills, 'Claude');

  // Prune legacy skills (rmrf on an absent path is a no-op).
  for (const legacy of LEGACY_SKILLS) {
    rmrf(path.join(repo, '.claude', 'skills', legacy));
  }

  // Shared agents — Claude only (OpenCode and omp do not read .claude/agents/).
  if (exists(agentsSrc)) {
    const claudeAgents = path.join(repo, '.claude', 'agents');
    mkdirp(claudeAgents);
    for (const name of listFiles(agentsSrc)) {
      copyFile(path.join(agentsSrc, name), path.join(claudeAgents, name));
      log(`Copied shared agent: ${name}`);
    }
  }
  // Provider-specific agent overrides (applied after shared, so they win).
  const claudeOverrides = path.join(templates, '.claude', 'agents');
  if (exists(claudeOverrides)) {
    const claudeAgents = path.join(repo, '.claude', 'agents');
    mkdirp(claudeAgents);
    for (const name of listFiles(claudeOverrides)) {
      copyFile(path.join(claudeOverrides, name), path.join(claudeAgents, name));
      log(`Copied Claude agent override: ${name}`);
    }
  }
  // The OpenCode implementor (1.2.0) is gone: remove the scaffolded agent file
  // when it still carries the template marker, then prune .opencode/agents and
  // .opencode if that left them empty. Foreign files keep both dirs alive.
  const implementor = path.join(repo, LEGACY_OPENCODE_IMPLEMENTOR);
  if (
    exists(implementor) &&
    fs.readFileSync(implementor, 'utf8').includes(LEGACY_OPENCODE_IMPLEMENTOR_MARKER)
  ) {
    rmrf(implementor);
    rmdirIfEmpty(path.join(repo, '.opencode', 'agents'));
    rmdirIfEmpty(path.join(repo, '.opencode'));
    log('Removed legacy OpenCode implementor agent (.opencode/agents/implementor.md)');
  }

  // The template's scripts/ no longer ships downstream. When a future version
  // retires downstream files (LEGACY_SCRIPT_PATHS), scrub them and prune any
  // now-empty template script dirs (preserving scripts the downstream owns).
  if (LEGACY_SCRIPT_PATHS.length) {
    for (const rel of LEGACY_SCRIPT_PATHS) {
      rmrf(path.join(repo, rel));
    }
    for (const d of ['scripts/shared', 'scripts/posix', 'scripts/windows', 'scripts']) {
      rmdirIfEmpty(path.join(repo, d));
    }
    log('Removed legacy template scripts (scripts/ no longer ships downstream)');
  }

  if (withScreenshots) {
    const wfDir = path.join(repo, '.github', 'workflows');
    mkdirp(wfDir);
    copyFile(
      path.join(templates, '.github', 'workflows', 'cleanup-screenshots.yml'),
      path.join(wfDir, 'cleanup-screenshots.yml'),
    );
    log('Copied .github/workflows/cleanup-screenshots.yml');
  }

  manageGitignore.ensureIgnore(repo);
  log('Updated .gitignore managed workflow block');

  manageInstructions.upsert(
    path.join(repo, 'CLAUDE.md'),
    path.join(templates, 'CLAUDE.snippet.md'),
  );
  log('Updated CLAUDE.md managed block');

  // AGENTS.md is no longer created, but an existing one is kept current: OpenCode
  // prefers AGENTS.md over CLAUDE.md, so it must carry the current block.
  if (exists(path.join(repo, 'AGENTS.md'))) {
    manageInstructions.upsert(
      path.join(repo, 'AGENTS.md'),
      path.join(templates, 'AGENTS.snippet.md'),
    );
    log('Updated AGENTS.md managed block');
  }
}

module.exports = { scaffold, LEGACY_SKILLS, LEGACY_SCRIPT_PATHS };
