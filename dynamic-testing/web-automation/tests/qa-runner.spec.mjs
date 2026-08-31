import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildPlaywrightArgs,
  cleanGeneratedPaths,
  parseReportArgs,
  parseTestArgs,
} from '../assets/templates/scripts/qa.mjs';

test('qa runner builds one stable UI command and forwards project options', () => {
  assert.deepEqual(
    buildPlaywrightArgs('ui', ['--project=chromium']),
    ['--no-install', 'playwright', 'test', 'tests/ui', '--project=chromium'],
  );
});

test('qa runner keeps surface routing when an explicit grep filter is supplied', () => {
  assert.deepEqual(
    buildPlaywrightArgs('functional', ['--grep', '@smoke']),
    ['--no-install', 'playwright', 'test', 'tests/functional', '--grep', '@smoke'],
  );
});

test('qa runner routes every selected surface to one exclusive test directory', () => {
  assert.equal(buildPlaywrightArgs('ui')[3], 'tests/ui');
  assert.equal(buildPlaywrightArgs('api')[3], 'tests/api');
  assert.equal(buildPlaywrightArgs('functional')[3], 'tests/functional');
  assert.deepEqual(buildPlaywrightArgs('all'), ['--no-install', 'playwright', 'test']);
});

test('qa runner parses surface without leaking its control flag to Playwright', () => {
  assert.deepEqual(parseTestArgs(['--surface', 'api', '--project', 'chromium']), {
    surface: 'api',
    extraArgs: ['--project', 'chromium'],
  });
});

test('qa runner rejects an unsupported surface', () => {
  assert.throws(() => parseTestArgs(['--surface', 'mobile']), /Unknown test surface/);
});

test('qa report uses distinct contract and HTML report output flags', () => {
  assert.deepEqual(parseReportArgs([
    '--mode', 'ui',
    '--results-dir', 'raw-results',
    '--contract-output', 'reports/contract.json',
    '--report-output', 'reports/html',
  ]), {
    mode: 'ui',
    resultsDir: 'raw-results',
    contractOutput: 'reports/contract.json',
    reportOutput: 'reports/html',
  });
  assert.throws(
    () => parseReportArgs(['--output', 'reports/shared']),
    /does not accept ambiguous --output/,
  );
  assert.throws(
    () => parseReportArgs(['--mode', 'typo']),
    /Unknown Allure mode/,
  );
  assert.throws(
    () => parseReportArgs(['--no-media']),
    /forbidden by the canonical Allure contract/,
  );
});

test('qa report rejects an Allure contract inside the cleaned HTML report directory', () => {
  assert.throws(
    () => parseReportArgs([
      '--contract-output', 'reports/html/contract.json',
      '--report-output', 'reports/html',
    ]),
    /must be outside --report-output/,
  );
});

test('qa clean removes generated output but preserves README and .gitkeep sentinels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-clean-'));
  try {
    fs.mkdirSync(path.join(root, 'reports', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'reports', 'README.md'), 'tracked guidance\n');
    fs.writeFileSync(path.join(root, 'reports', '.gitkeep'), '');
    fs.writeFileSync(path.join(root, 'reports', 'quality-gate.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'reports', 'nested', 'result.json'), '{}\n');

    const status = cleanGeneratedPaths(root);

    assert.equal(status, 0);
    assert.equal(fs.readFileSync(path.join(root, 'reports', 'README.md'), 'utf8'), 'tracked guidance\n');
    assert.equal(fs.existsSync(path.join(root, 'reports', '.gitkeep')), true);
    assert.equal(fs.existsSync(path.join(root, 'reports', 'quality-gate.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'reports', 'nested')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
