import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectCiPreflight } from '../assets/templates/scripts/ci-preflight.mjs';

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function projectRoot({ lockfileVersion = 3 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-preflight-'));
  write(root, 'package.json', JSON.stringify({
    scripts: {
      'qa:lint': 'true',
      'qa:preflight': 'true',
      'qa:ci-surfaces': 'true',
      'qa:test:ui': 'true',
      'qa:test:api': 'true',
      'qa:test:functional': 'true',
      'qa:quality': 'true',
      'qa:contract': 'true',
      'qa:report': 'true',
      'qa:merge-allure': 'true',
      'pom-codegen': 'true',
      'module-layout': 'true',
      'complexity-gate': 'true',
      'api-operation-coverage': 'true',
      'testcase-workflow': 'true',
    },
  }));
  write(root, 'package-lock.json', JSON.stringify({ lockfileVersion, packages: {} }));
  write(root, 'quality-gates.json', JSON.stringify({ version: 1, thresholds: {} }));
  write(root, 'automation-complexity.json', JSON.stringify({ schema_version: 1, limits: {} }));
  write(root, 'scripts/qa.mjs', 'export {};\n');
  write(root, 'scripts/ci-preflight.mjs', 'export {};\n');
  write(root, 'scripts/ci-surfaces.mjs', 'export {};\n');
  write(root, 'scripts/execution-lock.mjs', 'export {};\n');
  write(root, 'scripts/generate-pom-code.mjs', 'export {};\n');
  write(root, 'scripts/verify-module-artifact-layout.mjs', 'export {};\n');
  write(root, 'scripts/verify-automation-complexity.mjs', 'export {};\n');
  write(root, 'scripts/verify-api-operation-coverage.mjs', 'export {};\n');
  write(root, 'scripts/run-testcase-pom.mjs', 'export {};\n');
  write(root, 'fixtures/parallel-pool.js', 'module.exports = {};\n');
  write(root, 'fixtures/parallel-pool.d.ts', 'export {};\n');
  write(root, 'playwright.config.ts', 'export default {};\n');
  return root;
}

test('CI preflight blocks a project without a committed lockfile', () => {
  const root = projectRoot();
  try {
    fs.rmSync(path.join(root, 'package-lock.json'));
    const result = inspectCiPreflight(root, {
      surface: 'api',
      env: { API_BASE_URL: 'https://api.example.test' },
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'CI_FILE_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight reports missing inputs without exposing secret values', () => {
  const root = projectRoot();
  try {
    const result = inspectCiPreflight(root, {
      surface: 'all',
      requireAuth: true,
      env: {},
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'CI_URL_MISSING'));
    assert.ok(result.violations.some(item => item.code === 'CI_AUTH_INPUT_MISSING'));
    assert.doesNotMatch(JSON.stringify(result), /password|secret-value/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight blocks unresolved source placeholders', () => {
  const root = projectRoot();
  try {
    write(root, 'tests/example.ts', 'const value = "<UNRESOLVED>";\n');
    const result = inspectCiPreflight(root, {
      surface: 'api',
      env: { API_BASE_URL: 'https://api.example.test' },
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'CI_PLACEHOLDER_UNRESOLVED'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight passes with valid lockfile, URLs and single-account auth', () => {
  const root = projectRoot();
  try {
    const result = inspectCiPreflight(root, {
      surface: 'all',
      requireAuth: true,
      env: {
        UI_BASE_URL: 'https://ui.example.test',
        API_BASE_URL: 'https://api.example.test',
        TEST_USER: 'qa@example.test',
        TEST_PASS: 'not-written-to-result',
      },
    });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.violations, []);
    assert.doesNotMatch(JSON.stringify(result), /not-written-to-result/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight blocks shared credentials when multiple workers are explicit', () => {
  const root = projectRoot();
  try {
    const result = inspectCiPreflight(root, {
      surface: 'api',
      requireAuth: true,
      env: {
        API_BASE_URL: 'https://api.example.test',
        TEST_USER: 'qa@example.test',
        TEST_PASS: 'redacted',
        PW_WORKERS: '2',
      },
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'CI_AUTH_POOL_REQUIRED'));
    assert.doesNotMatch(JSON.stringify(result), /redacted/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight accepts a unique account pool sized for explicit workers', () => {
  const root = projectRoot();
  try {
    const result = inspectCiPreflight(root, {
      surface: 'api',
      requireAuth: true,
      env: {
        API_BASE_URL: 'https://api.example.test',
        PW_WORKERS: '2',
        QA_TEST_ACCOUNTS_JSON: JSON.stringify([
          { email: 'qa-0@example.test', password: 'secret-0' },
          { email: 'qa-1@example.test', password: 'secret-1' },
        ]),
        QA_TEST_DATASETS_JSON: JSON.stringify([
          { id: 'data-0', dataRoot: 'runtime-data/slot-0' },
          { id: 'data-1', dataRoot: 'runtime-data/slot-1' },
        ]),
      },
    });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.violations, []);
    assert.doesNotMatch(JSON.stringify(result), /secret-[01]/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI preflight rejects an old npm lockfile format', () => {
  const root = projectRoot({ lockfileVersion: 1 });
  try {
    const result = inspectCiPreflight(root, {
      surface: 'api',
      env: { API_BASE_URL: 'https://api.example.test' },
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'CI_LOCKFILE_UNSUPPORTED'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('functional CI preflight requires both UI and API targets', () => {
  const root = projectRoot();
  try {
    const missingApi = inspectCiPreflight(root, {
      surface: 'functional',
      env: { UI_BASE_URL: 'https://ui.example.test' },
    });
    assert.equal(missingApi.status, 'BLOCKED');
    assert.ok(missingApi.violations.some(item =>
      item.code === 'CI_URL_MISSING' && item.message.includes('API_BASE_URL')));

    const complete = inspectCiPreflight(root, {
      surface: 'functional',
      env: {
        UI_BASE_URL: 'https://ui.example.test',
        API_BASE_URL: 'https://api.example.test',
      },
    });
    assert.equal(complete.status, 'PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
