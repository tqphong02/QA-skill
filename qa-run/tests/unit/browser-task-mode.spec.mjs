import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..', '..');
const manifest = path.join(skillRoot, 'scripts', 'helpers', 'run-manifest.mjs');

test('BROWSER_TASK_FAST defaults to the bundled Playwright runtime without a business brief', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fast-browser-task-'));
  try {
    const result = spawnSync(process.execPath, [
      manifest,
      'start',
      '--run-id', 'fast-task-explicit-id',
      '--mode', 'BROWSER_TASK_FAST',
      '--workers', '1',
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'evidence', 'manifest-latest.json'),
      'utf8',
    ));
    assert.equal(payload.requested_mode, 'BROWSER_TASK_FAST');
    assert.equal(payload.run_id, 'fast-task-explicit-id');
    assert.equal(fs.existsSync(path.join(dataDir, 'evidence', 'manifest-fast-task-explicit-id.json')), true);
    assert.equal(payload.test_mode, 'EXPLORATORY_BROWSER_QA');
    assert.equal(payload.execution_profile, 'FAST');
    assert.equal(payload.fast_task, true);
    assert.equal(payload.business_context, null);
    assert.equal(payload.browser_driver, 'playwright-runtime');
    assert.equal(payload.browser_observer, 'playwright-runtime');
    assert.equal(payload.network_observer, 'playwright-runtime');
    assert.equal(payload.browser_observability.same_session_required, true);
    assert.equal(payload.browser_observability.network_observer, 'playwright-runtime');
    assert.equal(payload.browser_resolution.policy, 'playwright-runtime-default');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('explicit auto remains available as an opt-in fallback policy', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fast-browser-auto-'));
  try {
    const result = spawnSync(process.execPath, [
      manifest,
      'start',
      '--mode', 'BROWSER_TASK_FAST',
      '--browser-driver', 'auto',
      '--browser-observer', 'auto',
      '--network-observer', 'auto',
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'evidence', 'manifest-latest.json'),
      'utf8',
    ));
    assert.equal(payload.browser_driver, 'auto');
    assert.equal(payload.browser_observer, 'auto');
    assert.equal(payload.network_observer, 'auto');
    assert.equal(payload.test_mode, 'EXPLORATORY_BROWSER_QA');
    assert.equal(payload.execution_profile, 'FAST');
    assert.equal(payload.browser_resolution.policy, 'explicit-or-auto');
    assert.equal(payload.browser_resolution.explicit_driver, true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('FAST is a profile of the canonical exploratory route', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fast-browser-profile-'));
  try {
    const result = spawnSync(process.execPath, [
      manifest,
      'start',
      '--mode', 'EXPLORATORY_BROWSER_QA',
      '--profile', 'FAST',
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'evidence', 'manifest-latest.json'),
      'utf8',
    ));
    assert.equal(payload.requested_mode, 'EXPLORATORY_BROWSER_QA');
    assert.equal(payload.test_mode, 'EXPLORATORY_BROWSER_QA');
    assert.equal(payload.execution_profile, 'FAST');
    assert.equal(payload.fast_task, true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
