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
      'qa:test:ui': 'true',
      'qa:test:api': 'true',
      'qa:test:functional': 'true',
      'qa:quality': 'true',
      'qa:contract': 'true',
      'qa:report': 'true',
      'qa:merge-allure': 'true',
    },
  }));
  write(root, 'package-lock.json', JSON.stringify({ lockfileVersion, packages: {} }));
  write(root, 'quality-gates.json', JSON.stringify({ version: 1, thresholds: {} }));
  write(root, 'scripts/qa.mjs', 'export {};\n');
  write(root, 'scripts/ci-preflight.mjs', 'export {};\n');
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
