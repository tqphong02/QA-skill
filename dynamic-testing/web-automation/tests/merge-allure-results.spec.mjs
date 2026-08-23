import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { mergeAllureResults } from '../assets/templates/scripts/merge-allure-results.mjs';

function write(root, relative, contents) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

test('Allure merge copies results and attachments from each CI job', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-merge-pass-'));
  try {
    const input = path.join(root, 'artifacts');
    write(input, 'job-ui/reports/allure-results/ui-result.json', '{"status":"passed"}\n');
    write(input, 'job-ui/reports/allure-results/ui-image.png', 'ui-image');
    write(input, 'job-api/reports/allure-results/api-result.json', '{"status":"passed"}\n');
    write(input, 'job-api/reports/allure-results/api-image.png', 'api-image');
    const output = path.join(root, 'merged', 'reports', 'allure-results');
    const result = mergeAllureResults({ inputRoot: input, outputDir: output });
    assert.equal(result.status, 'PASS');
    assert.equal(result.copied_files, 4);
    assert.equal(fs.readFileSync(path.join(output, 'ui-result.json'), 'utf8'), '{"status":"passed"}\n');
    assert.equal(fs.readFileSync(path.join(output, 'api-image.png'), 'utf8'), 'api-image');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Allure merge blocks conflicting filenames instead of overwriting evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-merge-collision-'));
  try {
    const input = path.join(root, 'artifacts');
    write(input, 'job-a/reports/allure-results/same-result.json', 'one');
    write(input, 'job-b/reports/allure-results/same-result.json', 'two');
    assert.throws(
      () => mergeAllureResults({ inputRoot: input, outputDir: path.join(root, 'merged') }),
      /ALLURE_RESULT_COLLISION/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Allure merge blocks when the artifact root has no results', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-merge-empty-'));
  try {
    const input = path.join(root, 'artifacts');
    fs.mkdirSync(input, { recursive: true });
    const result = mergeAllureResults({ inputRoot: input, outputDir: path.join(root, 'merged') });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.copied_files, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
