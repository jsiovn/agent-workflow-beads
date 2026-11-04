'use strict';

// Port of scripts/posix/check-prereqs.sh. Python is no longer required (the
// scaffold logic is native Node now), so it is not checked.
//
// Beyond the required tools, this reports two non-fatal things:
//   - the installed `bd` version, warning below MIN_BD_VERSION (the shipped
//     skills use `bd ready --brief` and `bd update --claim`, added in bd 1.3.0);
//   - the optional rtk output condenser (https://github.com/rtk-ai/rtk), whose
//     Claude Code hook is per-machine (`rtk init -g`), so the template only
//     detects it and never writes it.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { which } = require('./which');
const { runCapture } = require('./proc');

const MIN_BD_VERSION = '1.3.0';
const RTK_HOOK_COMMAND = 'rtk hook claude';
// Pre-0.37.2 rtk registered a shell script instead of the native hook command.
const RTK_LEGACY_HOOK = 'rtk-rewrite.sh';

// Extract the first X.Y.Z from a version string ("bd version 1.3.3 (Homebrew)").
function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Negative when a < b, zero when equal, positive when a > b.
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// Returns { version, ok } where version is the parsed "X.Y.Z" or null.
function checkBdVersion() {
  const res = runCapture('bd', ['version']);
  const parsed = res.status === 0 ? parseVersion(res.stdout) : null;
  if (!parsed) {
    process.stderr.write(
      `warning: could not read the bd version; the workflow skills need bd ${MIN_BD_VERSION} or newer\n`,
    );
    return { version: null, ok: false };
  }
  const version = parsed.join('.');
  const ok = compareVersions(parsed, parseVersion(MIN_BD_VERSION)) >= 0;
  if (!ok) {
    process.stderr.write(
      `warning: bd ${version} is older than ${MIN_BD_VERSION}; the workflow skills use ` +
        '`bd ready --brief` and `bd update --claim`. Upgrade bd (see docs/INSTALL.md).\n',
    );
  }
  return { version, ok };
}

function claudeSettingsPath(env = process.env, home = os.homedir()) {
  const dir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'settings.json');
}

// True when a PreToolUse hook in the user's global Claude Code settings runs rtk.
function rtkHookRegistered(settingsPath) {
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return false;
  }
  const entries = (settings && settings.hooks && settings.hooks.PreToolUse) || [];
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) =>
      entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => {
        const cmd = h && typeof h.command === 'string' ? h.command : '';
        return cmd.includes(RTK_HOOK_COMMAND) || cmd.includes(RTK_LEGACY_HOOK);
      }),
  );
}

// Returns { installed, version, hook } without ever modifying anything.
function detectRtk(options = {}) {
  if (!which('rtk')) return { installed: false, version: null, hook: false };
  const res = runCapture('rtk', ['--version']);
  const parsed = res.status === 0 ? parseVersion(res.stdout) : null;
  const settingsPath = options.settingsPath || claudeSettingsPath();
  return {
    installed: true,
    version: parsed ? parsed.join('.') : null,
    hook: rtkHookRegistered(settingsPath),
  };
}

const RTK_ENABLE_HINT = 'rtk init -g --auto-patch   (then restart Claude Code)';

// verbose: the `check` command prints a full optional-tools report; bootstrap /
// update only speak up when rtk is installed but its hook is not registered.
function reportRtk({ verbose }) {
  const rtk = detectRtk();
  if (!rtk.installed) {
    if (verbose) {
      console.log(
        'Optional: rtk not found. It condenses Bash command output for Claude Code to save tokens;' +
          ' see "Optional: rtk" in docs/INSTALL.md.',
      );
    }
    return rtk;
  }
  const label = rtk.version ? `rtk ${rtk.version}` : 'rtk';
  if (rtk.hook) {
    if (verbose) console.log(`Optional: ${label} installed, Claude Code hook registered.`);
  } else {
    process.stderr.write(
      `note: ${label} is installed but its Claude Code hook is not registered in ` +
        `${claudeSettingsPath()}. Enable it with: ${RTK_ENABLE_HINT}\n`,
    );
  }
  return rtk;
}

function checkPrereqs(options = {}) {
  const requireOpencode = Boolean(options.requireOpencode);
  const verbose = Boolean(options.verbose);
  const missing = [];

  for (const cmd of ['git', 'bd', 'dolt']) {
    if (!which(cmd)) missing.push(cmd);
  }

  if (requireOpencode && !which('opencode')) {
    process.stderr.write('warning: opencode is not on PATH\n');
  }

  if (missing.length > 0) {
    process.stderr.write(`missing required commands: ${missing.join(' ')}\n`);
    throw new Error(`missing required commands: ${missing.join(' ')}`);
  }

  const bd = checkBdVersion();
  console.log(`Required commands found: git, bd${bd.version ? ` ${bd.version}` : ''}, dolt`);
  reportRtk({ verbose });
}

module.exports = {
  checkPrereqs,
  checkBdVersion,
  detectRtk,
  rtkHookRegistered,
  claudeSettingsPath,
  parseVersion,
  compareVersions,
  MIN_BD_VERSION,
};
