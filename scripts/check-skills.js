#!/usr/bin/env node
'use strict';

// Template-repo-only guard for every shipped skill (not packed: scripts/ is not
// in package.json "files"). Run with `npm run check:skills`. Rules, from the
// obra/superpowers v7 skill tests:
//   1. SKILL.md stays under 20,000 bytes: Claude Code re-attaches a skill cut at
//      that size after compaction, so anything past it is silently lost.
//   2. No dev/test artifacts inside a shipped skill dir (CREATION-LOG.md,
//      test-*.md): they ship downstream and cost tokens for nothing.
//   3. No `@path` force-load links in a SKILL.md: they load the file eagerly.
//   4. No positional `$<digit>` tokens in a SKILL.md body: Claude Code replaces
//      them with the skill's arguments, so shell snippets like awk field
//      references break.
//   5. Every `references/<file>` a SKILL.md names must exist.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILL_ROOTS = ['skills', path.join('templates', 'skills')];
const MAX_SKILL_BYTES = 20000;
const WARN_SKILL_BYTES = 18000;
const DEV_FILE = /^(CREATION-LOG\.md|test-.*\.md)$/;
const FORCE_LOAD = /(^|\s)@[\w.-]*\/[\w./-]+\.md\b/;
const POSITIONAL = /\$[0-9]/;
const REFERENCE = /`(references\/[\w./-]+)`/g;

function listSkillDirs() {
  const dirs = [];
  for (const rel of SKILL_ROOTS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) dirs.push(path.join(rel, ent.name));
    }
  }
  return dirs.sort();
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function checkSkill(relDir) {
  const errors = [];
  const warnings = [];
  const absDir = path.join(ROOT, relDir);
  const skillFile = path.join(absDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    errors.push(`${relDir}: missing SKILL.md`);
    return { errors, warnings };
  }

  const bytes = fs.statSync(skillFile).size;
  if (bytes >= MAX_SKILL_BYTES) {
    errors.push(
      `${relDir}/SKILL.md: ${bytes} bytes (limit ${MAX_SKILL_BYTES}); move rarely-needed detail into references/`,
    );
  } else if (bytes >= WARN_SKILL_BYTES) {
    warnings.push(`${relDir}/SKILL.md: ${bytes} bytes, close to the ${MAX_SKILL_BYTES} limit`);
  }

  for (const file of walk(absDir)) {
    if (DEV_FILE.test(path.basename(file))) {
      errors.push(`${path.relative(ROOT, file)}: dev/test artifact inside a shipped skill`);
    }
  }

  const lines = fs.readFileSync(skillFile, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const where = `${relDir}/SKILL.md:${i + 1}`;
    if (FORCE_LOAD.test(line))
      errors.push(`${where}: @-link force-loads a file; name the path instead`);
    if (POSITIONAL.test(line)) {
      errors.push(`${where}: positional $<digit> token is replaced with skill arguments`);
    }
    for (const m of line.matchAll(REFERENCE)) {
      if (!fs.existsSync(path.join(absDir, m[1]))) errors.push(`${where}: ${m[1]} does not exist`);
    }
  });

  return { errors, warnings };
}

function main() {
  const dirs = listSkillDirs();
  const errors = [];
  const warnings = [];
  for (const dir of dirs) {
    const r = checkSkill(dir);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) across ${dirs.length} skills.`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-skills: ${dirs.length} skills OK`);
}

main();
