import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { inspectProjectRuntime } from '../assets/templates/scripts/bootstrap-playwright.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(REPO_ROOT, 'dynamic-testing/web-automation/assets/templates/scripts/bootstrap-playwright.mjs');

function makeProject(packageJson) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-bootstrap-'));
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  return root;
}

function fakeLocalRuntime(root) {
  for (const packageName of ['@playwright/test', '@types/node', 'typescript']) {
    const packageDirectory = path.join(root, 'node_modules', packageName);
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify({ name: packageName, version: '1.54.0' })}\n`,
      'utf8',
    );
  }
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  for (const binary of ['playwright', 'tsc']) fs.writeFileSync(path.join(root, 'node_modules', '.bin', binary), '', 'utf8');
}

test('runtime inspection reports a generated project with no install as needing bootstrap', () => {
  const root = makeProject({ name: 'fixture', devDependencies: {
    '@playwright/test': '^1.54.0',
    '@types/node': '^22.0.0',
    typescript: '^5.8.0',
  } });
  try {
    const result = inspectProjectRuntime(root);
    assert.equal(result.status, 'NEEDS_BOOTSTRAP');
    assert.equal(result.install_required, true);
    assert.equal(result.playwright_module, false);
    assert.deepEqual(result.missing_dependencies, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime inspection is READY only when local Playwright and TypeScript binaries exist', () => {
  const root = makeProject({ name: 'fixture', devDependencies: {
    '@playwright/test': '^1.54.0',
    '@types/node': '^22.0.0',
    typescript: '^5.8.0',
  } });
  try {
    fakeLocalRuntime(root);
    const result = inspectProjectRuntime(root);
    assert.equal(result.status, 'READY');
    assert.equal(result.install_required, false);
    assert.equal(result.playwright_module, true);
    assert.equal(result.playwright_cli, true);
    assert.equal(result.typescript_cli, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('check-only fails closed when project package metadata is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-bootstrap-missing-'));
  try {
    const result = spawnSync(process.execPath, [SCRIPT, '--project-root', root, '--check-only'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /package.json is required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
