import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  normalizeBrowserMcpEvidence,
} from '../assets/templates/scripts/discover-runtime-selectors.mjs';

function context() {
  return {
    testcase_id: 'TC_LOGIN_01',
    target_key: 'login_email',
    route: '/login',
    role: 'Guest',
    state: 'login form ready',
    actions: ['fill'],
    expected_visible: true,
  };
}

function source(overrides = {}) {
  return {
    schema_version: 2,
    feature: 'login',
    provider: 'playwright-mcp',
    browser_driver: 'playwright-mcp',
    browser_observer: 'playwright-mcp',
    tools_used: ['browser_navigate', 'browser_snapshot', 'browser_evaluate'],
    mcp: { session_id: 'mcp-run-001' },
    captured_at: '2026-08-22T00:00:00.000Z',
    run_id: 'mcp-run-001',
    app_build: 'build-001',
    targets: [{
      testcase_id: 'TC_LOGIN_01',
      target_key: 'login_email',
      route: '/login',
      strategy: 'xpath',
      locator: 'page.locator("xpath=//form[@aria-label=\"Login\"]//input[@name=\"email\"]")',
      xpath: '//form[@aria-label="Login"]//input[@name="email"]',
      reason: 'Stable form/name relationship was unique in the live DOM',
      candidates: [
        { strategy: 'testid', available: false },
        { strategy: 'id', available: false },
        { strategy: 'css', available: false },
        { strategy: 'role', available: false },
        { strategy: 'xpath', available: true, count: 1, verified: true },
      ],
      verification: {
        count: 1,
        visible: true,
        actionable: true,
        url: 'https://staging.example.test/login',
      },
    }],
    ...overrides,
  };
}

test('accepts Browser MCP XPath evidence with same-session verification', () => {
  const result = normalizeBrowserMcpEvidence(source(), [context()], {
    expectedProvider: 'playwright-mcp',
    appBuild: 'build-001',
    runId: 'mcp-run-001',
    feature: 'login',
  });

  assert.equal(result.status, 'runtime_verified');
  assert.equal(result.evidence.provider, 'playwright-mcp');
  assert.equal(result.evidence.targets[0].strategy, 'xpath');
  assert.equal(result.evidence.targets[0].verification.count, 1);
  assert.deepEqual(result.evidence.targets[0].tools_used, [
    'browser_navigate',
    'browser_snapshot',
    'browser_evaluate',
  ]);
});

test('CLI consumes Browser MCP evidence without loading Playwright', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-mcp-selector-'));
  try {
    const manifestPath = path.join(root, 'login.automation.json');
    const mcpPath = path.join(root, 'login.browser-mcp.json');
    const outputPath = path.join(root, 'selector-evidence', 'login.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schema_version: 1,
      testcases: [{
        testcase_id: 'TC_LOGIN_01',
        group: 'LOGIN',
        execution: {
          entry: { route: '/login', role_key: 'guest' },
          steps: [{
            id: 'S01',
            action: 'fill',
            target: { key: 'login_email', kind: 'field', name: 'Email' },
          }],
        },
      }],
    }, null, 2), 'utf8');
    fs.writeFileSync(mcpPath, JSON.stringify(source(), null, 2), 'utf8');

    const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/templates/scripts/discover-runtime-selectors.mjs');
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--project-root', root,
      '--manifest', manifestPath,
      '--group', 'LOGIN',
      '--app-build', 'build-001',
      '--browser-mcp-evidence', mcpPath,
      '--output', outputPath,
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(evidence.status, 'runtime_verified');
    assert.equal(evidence.provider, 'playwright-mcp');
    assert.equal(evidence.targets.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blocks Browser MCP evidence when the DOM evaluation tool is missing', () => {
  const invalid = source({ tools_used: ['browser_navigate', 'browser_snapshot'] });
  const result = normalizeBrowserMcpEvidence(invalid, [context()], {
    expectedProvider: 'playwright-mcp',
    appBuild: 'build-001',
    runId: 'mcp-run-001',
    feature: 'login',
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /browser_evaluate/i);
});

test('blocks absolute or positional XPath even when it matches once', () => {
  const invalid = source({
    targets: [{
      ...source().targets[0],
      locator: 'page.locator("/html/body/main/form/input[1]")',
      xpath: '/html/body/main/form/input[1]',
    }],
  });
  const result = normalizeBrowserMcpEvidence(invalid, [context()], {
    expectedProvider: 'playwright-mcp',
    appBuild: 'build-001',
    runId: 'mcp-run-001',
    feature: 'login',
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /forbidden|absolute|positional/i);
});
