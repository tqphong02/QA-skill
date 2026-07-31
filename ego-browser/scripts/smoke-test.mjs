#!/usr/bin/env node
/**
 * ego-browser/scripts/smoke-test.mjs
 * Minimal smoke test verifying each capability independently.
 *
 * Usage:
 *   node ego-browser/scripts/smoke-test.mjs                      # about:blank (safest)
 *   node ego-browser/scripts/smoke-test.mjs --url https://...    # specific URL
 *   node ego-browser/scripts/smoke-test.mjs --json               # machine-readable
 *
 * Safe URL behavior:
 *   - Default: about:blank — no network, no login required, fastest
 *   - data:text/html URL for interaction test (click, fill)
 *   - Custom URL via --url flag if caller knows it is safe
 *
 * Exit codes:
 *   0 = all capabilities confirmed
 *   1 = one or more capabilities failed
 *
 * JSON schema:
 * {
 *   "driver": "ego-browser",
 *   "passed": boolean,
 *   "elapsed_ms": number,
 *   "spaceId": string | null,
 *   "capabilities": {
 *     "navigation": boolean,
 *     "snapshot": boolean,
 *     "screenshot": boolean,
 *     "events": boolean,
 *     "interaction": boolean
 *   },
 *   "networkBody": false,
 *   "confidence": "medium" | "low",
 *   "issues": string[]
 * }
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;
const jsonMode = args.includes('--json');

// Safe URLs for smoke test — no production, no login required
const SAFE_BLANK = 'about:blank';
const SAFE_INTERACTION_PAGE = 'data:text/html,<html><body><input id=inp value=""><button id=btn>Click</button></body></html>';

const startTime = Date.now();

// ── Phase 1: navigation + snapshot + screenshot + events on safe URL ──────────
const phase1Url = targetUrl || SAFE_BLANK;

const heredoc1 = `
const task = await useOrCreateTaskSpace('ego-smoke-${Date.now()}')
cliLog('SPACE_ID:' + task.id)

let navOk = false
let snapOk = false
let shotOk = false
let eventsOk = false

try {
  await openOrReuseTab(${JSON.stringify(phase1Url)}, { wait: true, timeout: 20 })
  navOk = true
  cliLog('NAV_OK')
} catch (e) {
  cliLog('NAV_FAIL:' + e.message)
}

if (navOk) {
  try {
    const snap = await snapshotText()
    snapOk = typeof snap === 'string'
    cliLog('SNAP_OK:' + snap.length)
  } catch (e) {
    cliLog('SNAP_FAIL:' + e.message)
  }

  try {
    const shot = await captureScreenshot({ format: 'png' })
    shotOk = !!shot
    cliLog('SHOT_OK:' + shot)
  } catch (e) {
    cliLog('SHOT_FAIL:' + e.message)
  }

  try {
    const ev = await drainEvents()
    eventsOk = Array.isArray(ev)
    cliLog('EVENTS_OK:' + ev.length)
  } catch (e) {
    cliLog('EVENTS_FAIL:' + e.message)
  }
}

cliLog('PHASE1_DONE')
`;

// ── Phase 2: interaction test on safe data: URI ───────────────────────────────
const heredoc2 = `
const task = await useOrCreateTaskSpace('ego-smoke-${Date.now()}-interact')

let interactionOk = false
try {
  await openOrReuseTab(${JSON.stringify(SAFE_INTERACTION_PAGE)}, { wait: true, timeout: 15 })
  await fillInput('#inp', 'smoke-test-value')
  await click({ selector: '#btn' })
  interactionOk = true
  cliLog('INTERACT_OK')
} catch (e) {
  cliLog('INTERACT_FAIL:' + e.message)
}

await completeTaskSpace(task.id, { keep: false })
cliLog('PHASE2_DONE')
`;

function runHeredoc(script, timeoutMs = 35000) {
  return spawnSync('ego-browser', ['nodejs'], {
    input: script,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: true,
  });
}

const r1 = runHeredoc(heredoc1);
const r2 = runHeredoc(heredoc2);

const elapsed = Date.now() - startTime;
const out1 = r1.stdout || '';
const out2 = r2.stdout || '';

// ── Parse ─────────────────────────────────────────────────────────────────────
const spaceId = (out1.match(/SPACE_ID:([^\n]*)/) || [])[1]?.trim() || null;
const navOk = out1.includes('NAV_OK');
const snapOk = out1.includes('SNAP_OK');
const shotOk = out1.includes('SHOT_OK');
const eventsOk = out1.includes('EVENTS_OK');
const interactionOk = out2.includes('INTERACT_OK');
const phase1Done = out1.includes('PHASE1_DONE');
const phase2Done = out2.includes('PHASE2_DONE');

const capabilities = {
  navigation: navOk,
  snapshot: snapOk,
  screenshot: shotOk,
  events: eventsOk,
  interaction: interactionOk,
};

const allPassed = Object.values(capabilities).every(Boolean) && phase1Done && phase2Done;

const report = {
  driver: 'ego-browser',
  url: phase1Url,
  passed: allPassed,
  elapsed_ms: elapsed,
  spaceId,
  capabilities,
  networkBody: false,
  confidence: allPassed ? 'medium' : 'low',
  issues: [],
};

// Collect issues
if (!navOk) report.issues.push(`navigation failed on ${phase1Url} — check ego lite app is running`);
if (!snapOk) report.issues.push('snapshotText() failed');
if (!shotOk) report.issues.push('captureScreenshot() failed');
if (!eventsOk) report.issues.push('drainEvents() failed');
if (!interactionOk) {
  const detail = (out2.match(/INTERACT_FAIL:([^\n]*)/) || [])[1]?.trim() || 'unknown error';
  report.issues.push(`interaction test failed: ${detail}`);
}
if (!phase1Done && r1.status !== 0) {
  report.issues.push(`phase1 ego-browser exited ${r1.status}: ${(r1.stderr || '').slice(0, 150)}`);
}
if (!phase2Done && r2.status !== 0) {
  report.issues.push(`phase2 ego-browser exited ${r2.status}: ${(r2.stderr || '').slice(0, 150)}`);
}

// ── Output ────────────────────────────────────────────────────────────────────
if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\nego-browser smoke-test\n');
  const note = targetUrl ? `  URL: ${targetUrl}` : `  URL: about:blank (safe default; use --url <URL> for specific page)`;
  console.log(note);
  console.log('  Interaction page: data:text/html (safe, no network)\n');

  for (const [cap, val] of Object.entries(capabilities)) {
    console.log(`  ${val ? '✅' : '❌'} ${cap}`);
  }
  console.log('  ℹ️  networkBody: false — use chrome-devtools-mcp as network_observer for body/headers\n');

  if (report.issues.length > 0) {
    console.log('Issues:');
    for (const issue of report.issues) console.log(`  • ${issue}`);
    console.log();
    console.log('Run detect first: node ego-browser/scripts/detect.mjs');
  } else {
    console.log(`✅ smoke-test passed (${elapsed}ms)`);
    console.log(`   confidence: ${report.confidence}`);
    console.log('   Note: network body requires chrome-devtools-mcp as network_observer');
  }
  console.log();
}

process.exit(allPassed ? 0 : 1);
