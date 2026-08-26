#!/usr/bin/env node
/**
 * ../scripts/detect.mjs
 * Read-only detection of ego-browser environment.
 * Does NOT install, download, or open the app.
 *
 * Usage:
 *   node ../scripts/detect.mjs          # human-readable
 *   node ../scripts/detect.mjs --json   # stable JSON for dynamic-web-exploratory parser
 *
 * Exit codes:
 *   0 = available (all checks passed)
 *   1 = unavailable (generic — skill or app not installed)
 *   2 = unsupported_platform (Windows / Linux)
 *   3 = installed but app not running
 *   4 = CLI not responsive (timeout or crash)
 *
 * JSON schema (--json):
 * {
 *   "available": boolean,
 *   "platform": "darwin" | "win32" | "linux" | ...,
 *   "cliInstalled": boolean,
 *   "appRunning": boolean,
 *   "skillInstalled": boolean,
 *   "cliResponsive": boolean,
 *   "reason": string | null,
 *   "exitCode": 0 | 1 | 2 | 3 | 4
 * }
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JSON_MODE = process.argv.includes('--json');

// ── Result state ──────────────────────────────────────────────────────────────
const result = {
  available: false,
  platform: process.platform,
  cliInstalled: false,
  appRunning: false,
  skillInstalled: false,
  cliResponsive: false,
  reason: null,
  exitCode: 1,
};

// ── 1. Platform ───────────────────────────────────────────────────────────────
if (process.platform !== 'darwin') {
  result.reason = `unsupported_platform: ${process.platform} — ego-browser is macOS only; use playwright-mcp or chrome-devtools-mcp`;
  result.exitCode = 2;
  emit(result);
  process.exit(2);
}

// ── 2. CLI in PATH ────────────────────────────────────────────────────────────
let cliBin = null;
try {
  cliBin = execSync('which ego-browser 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
  result.cliInstalled = Boolean(cliBin);
} catch {
  result.cliInstalled = false;
}

if (!result.cliInstalled) {
  result.reason = 'cli_not_found: ego-browser command not in PATH — install ego lite or run: npx skills add citrolabs/ego-lite';
  result.exitCode = 1;
  emit(result);
  process.exit(1);
}

// ── 3. App installed / running ────────────────────────────────────────────────
const appPaths = [
  '/Applications/ego lite.app',
  join(homedir(), 'Applications', 'ego lite.app'),
];
result.appRunning = appPaths.some(p => existsSync(p));

// ── 4. Upstream skill installed ───────────────────────────────────────────────
try {
  const upstreamPath = execSync('npx --yes skills which citrolabs/ego-lite 2>/dev/null', {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
  result.skillInstalled = Boolean(upstreamPath);
} catch {
  result.skillInstalled = false;
}

// ── 5. CLI responds ───────────────────────────────────────────────────────────
if (result.appRunning) {
  const probe = spawnSync(
    'ego-browser',
    ['nodejs'],
    {
      input: `cliLog('probe-ok')\n`,
      encoding: 'utf8',
      timeout: 8000,
      shell: true,
    },
  );
  result.cliResponsive = probe.status === 0 && (probe.stdout || '').includes('probe-ok');

  if (!result.cliResponsive) {
    result.reason = 'cli_not_responsive: ego-browser did not respond — is ego lite app running and responsive?';
    result.exitCode = 4;
    emit(result);
    process.exit(4);
  }
} else {
  // App not found in Applications — may not be running
  result.reason = 'app_not_running: ego lite.app not found in /Applications or ~/Applications';
  result.exitCode = 3;
  emit(result);
  process.exit(3);
}

// ── All passed ────────────────────────────────────────────────────────────────
result.available = true;
result.reason = null;
result.exitCode = 0;
emit(result);
process.exit(0);

// ── Output helper ─────────────────────────────────────────────────────────────
function emit(r) {
  if (JSON_MODE) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log('\nego-browser detect\n');
  const rows = [
    ['platform', r.platform, r.platform === 'darwin'],
    ['cliInstalled', r.cliInstalled, r.cliInstalled],
    ['appRunning', r.appRunning, r.appRunning],
    ['skillInstalled', r.skillInstalled, r.skillInstalled],
    ['cliResponsive', r.cliResponsive, r.cliResponsive],
  ];
  for (const [key, val, ok] of rows) {
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${key}: ${val}`);
  }
  console.log();
  if (r.reason) {
    console.log(`  Issue: ${r.reason}`);
    console.log();
    if (r.exitCode === 2) {
      console.log('  Fallback options:');
      console.log('    playwright-mcp, playwright-runtime, chrome-devtools-mcp');
    } else if (r.exitCode === 3) {
      console.log('  Fix: Open ego lite from Applications, then re-run detect.mjs');
      console.log('  Install guide: sh ../scripts/install-skill.sh');
    } else if (r.exitCode === 4) {
      console.log('  Fix: Check ego lite is running and not in error state');
    } else {
      console.log('  Install guide: sh ../scripts/install-skill.sh');
    }
  } else {
    console.log('  ✅ ego-browser available (exit 0)');
    console.log('  Run smoke-test: node ../scripts/smoke-test.mjs');
  }
  console.log();
}
