#!/usr/bin/env node
/**
 * run-manifest.mjs — Test Run Manifest Initializer & Logger
 *
 * Khởi tạo và cập nhật file evidence/manifest-<run_id>.json chứa đầy đủ thông tin:
 *   - run_id
 *   - environment, base_url, git_commit, app_version
 *   - browser, viewport, account_roles
 *   - test_data_namespace
 *   - started_time, finished_time, duration_ms
 *   - worker_count
 *   - knowledge_version
 *
 * Usage:
 *   # Start manifest
 *   node run-manifest.mjs start --workers 4 --mode SHEET_EXECUTION
 *
 *   # Finish manifest
 *   node run-manifest.mjs finish <RUN_ID> --verdict PASS --total-cases 20 --passed 18 --failed 2
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const EVID = path.join(DATA, 'evidence');
fs.mkdirSync(EVID, { recursive: true });

const args = process.argv.slice(2);
const command = args[0] || 'start';
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.QA_GIT_COMMIT || 'unknown';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.QA_GIT_BRANCH || 'unknown';
  }
}

if (command === 'start') {
  const runId = `run-${Date.now()}`;
  const manifest = {
    run_id: runId,
    status: 'RUNNING',
    environment: process.env.QA_ENV || 'UAT',
    base_url: process.env.QA_BASE_URL || 'N/A',
    git_commit: getGitCommit(),
    git_branch: getGitBranch(),
    app_version: process.env.QA_APP_VERSION || '1.0.0',
    browser: 'chromium-headless',
    viewport: '1440x900',
    account_roles: [process.env.QA_EMAIL || 'default_user'],
    test_data_namespace: `ns-${Date.now().toString(36)}`,
    worker_count: parseInt(getArg('--workers', '1'), 10),
    test_mode: getArg('--mode', 'EXPLORATORY'),
    knowledge_version: 'app-flow-map.json',
    started_time: new Date().toISOString(),
    finished_time: null,
    duration_ms: null,
    summary: {
      total_cases: 0,
      passed: 0,
      failed: 0,
      untested: 0,
    },
  };

  const manifestPath = path.join(EVID, `manifest-${runId}.json`);
  const latestLink    = path.join(EVID, 'manifest-latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(latestLink, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[run-manifest] Manifest initialized: ${runId}`);
  console.log(`  File:   ${manifestPath}`);
  console.log(`  Commit: ${manifest.git_commit} (${manifest.git_branch})`);
  console.log(`  Base:   ${manifest.base_url}`);
  console.log(`  Data NS: ${manifest.test_data_namespace}`);
  console.log(runId); // Output runId for script capture

} else if (command === 'finish') {
  const runId = args[1] || getArg('--run-id', '');
  let manifestPath = path.join(EVID, `manifest-${runId}.json`);
  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(EVID, 'manifest-latest.json');
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`[run-manifest] ❌ Cannot find manifest for runId ${runId}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const finishedTime = new Date();
  const startTime = new Date(manifest.started_time);

  manifest.status = getArg('--verdict', 'COMPLETED');
  manifest.finished_time = finishedTime.toISOString();
  manifest.duration_ms = finishedTime.getTime() - startTime.getTime();
  manifest.summary = {
    total_cases: parseInt(getArg('--total-cases', '0'), 10),
    passed: parseInt(getArg('--passed', '0'), 10),
    failed: parseInt(getArg('--failed', '0'), 10),
    untested: parseInt(getArg('--untested', '0'), 10),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(EVID, 'manifest-latest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[run-manifest] Manifest finalized: ${manifest.run_id}`);
  console.log(`  Verdict:  ${manifest.status}`);
  console.log(`  Duration: ${(manifest.duration_ms / 1000).toFixed(2)}s`);
  console.log(`  Summary:  ${manifest.summary.passed}/${manifest.summary.total_cases} passed`);
}
