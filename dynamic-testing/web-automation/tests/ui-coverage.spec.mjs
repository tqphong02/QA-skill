import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildUiCoverage } from '../assets/templates/scripts/verify-ui-coverage.mjs';

const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/templates/scripts/run-testcase-pom.mjs');

function writeFixture({ extraFunction = null, provenance = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ui-coverage-'));
  const manifestPath = path.join(root, 'login.automation.json');
  const inventoryPath = path.join(root, 'ui-function-inventory.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema_version: 1,
    testcases: [{
      testcase_id: 'TC-LOGIN-01',
      group: 'LOGIN',
      execution: {
        entry: { route: '/login', role_key: 'employee' },
        steps: [
          { id: 'S01', action: 'fill', target: { key: 'email_input', route: '/login' }, assertions: [] },
          { id: 'S02', action: 'click', target: { key: 'login_submit', route: '/login' }, assertions: [] },
        ],
        outcome: { route: '/dashboard', assertions: [] },
      },
    }],
  }, null, 2), 'utf8');

  const functions = [
    {
      function_key: 'LOGIN_EMAIL',
      name: 'Nháº­p email',
      route: '/login',
      state: 'logged_out',
      role_key: 'employee',
      target_keys: ['email_input'],
      actions: ['fill'],
    },
    {
      function_key: 'LOGIN_SUBMIT',
      name: 'ÄÄƒng nháº­p',
      route: '/login',
      state: 'logged_out',
      role_key: 'employee',
      target_keys: ['login_submit'],
      actions: ['click'],
    },
  ];
  if (extraFunction) functions.push(extraFunction);
  fs.writeFileSync(inventoryPath, JSON.stringify({
    schema_version: 1,
    artifact: 'UI_FUNCTION_INVENTORY',
    provider: provenance ? 'playwright-mcp' : 'unknown',
    browser_driver: provenance ? 'playwright-mcp' : 'unknown',
    browser_observer: provenance ? 'playwright-mcp' : 'unknown',
    tools_used: provenance ? ['browser_navigate', 'browser_snapshot', 'browser_evaluate'] : [],
    mcp: provenance ? { session_id: 'mcp-session-001', tools_used: [] } : {},
    run_id: provenance ? 'ui-inventory-run-001' : '',
    app_build: 'build-001',
    captured_at: new Date().toISOString(),
    functions,
  }, null, 2), 'utf8');
  return { root, manifestPath, inventoryPath };
}

test('UI coverage passes when every Browser MCP function maps to a POM target/action', () => {
  const fixture = writeFixture();
  try {
    const report = buildUiCoverage({
      manifestPath: fixture.manifestPath,
      inventoryPath: fixture.inventoryPath,
      expectedAppBuild: 'build-001',
    });
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
    assert.equal(report.scope, 'full');
    assert.equal(report.summary.coverage_percent, 100);
    assert.deepEqual(report.functions.map(item => item.status), ['covered', 'covered']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('explicit ui_function_keys provide release-grade function mapping', () => {
  const fixture = writeFixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.testcases[0].ui_function_keys = ['LOGIN_EMAIL', 'LOGIN_SUBMIT'];
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const report = buildUiCoverage({
      manifestPath: fixture.manifestPath,
      inventoryPath: fixture.inventoryPath,
      requireExplicit: true,
    });
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.functions.map(item => item.coverage_mode), ['explicit', 'explicit']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('UI coverage blocks a Browser MCP function that has no testcase mapping', () => {
  const fixture = writeFixture({
    extraFunction: {
      function_key: 'LOGIN_FORGOT_PASSWORD',
      name: 'QuÃªn máº­t kháº©u',
      route: '/login',
      state: 'logged_out',
      role_key: 'employee',
      target_keys: ['forgot_password'],
      actions: ['click'],
    },
  });
  try {
    const report = buildUiCoverage({ manifestPath: fixture.manifestPath, inventoryPath: fixture.inventoryPath });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => item.code === 'UI_FUNCTION_UNCOVERED'));
    assert.equal(report.summary.coverage_percent, 66.67);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('UI coverage blocks inventory without Browser MCP session provenance', () => {
  const fixture = writeFixture({ provenance: false });
  try {
    const report = buildUiCoverage({ manifestPath: fixture.manifestPath, inventoryPath: fixture.inventoryPath });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => item.code === 'UI_FUNCTION_INVENTORY_BROWSER_MCP_PROVENANCE_MISSING'));
    assert.ok(report.violations.some(item => item.code === 'UI_FUNCTION_INVENTORY_SESSION_MISSING'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('unified POM plan blocks before code generation when UI coverage is incomplete', () => {
  const fixture = writeFixture({
    extraFunction: {
      function_key: 'LOGIN_FORGOT_PASSWORD',
      name: 'QuÃªn máº­t kháº©u',
      route: '/login',
      state: 'logged_out',
      target_keys: ['forgot_password'],
      actions: ['click'],
    },
  });
  try {
    const result = spawnSync(process.execPath, [
      RUNNER,
      '--phase', 'plan',
      '--mode', 'ui',
      '--project-root', fixture.root,
      '--manifest', fixture.manifestPath,
      '--ui-inventory', fixture.inventoryPath,
      '--plan-output', path.join(fixture.root, 'reports', 'plan.json'),
    ], { encoding: 'utf8' });
    assert.equal(result.status, 2, `${result.stdout}
${result.stderr}`);
    assert.ok(fs.existsSync(path.join(fixture.root, 'reports', 'ui-function-coverage.json')));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
