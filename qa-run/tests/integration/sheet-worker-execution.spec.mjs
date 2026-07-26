import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QA_RUN_DIR = path.resolve(__dirname, '../..');
const REPO_DIR = path.resolve(QA_RUN_DIR, '..');
const EXECUTOR = path.join(QA_RUN_DIR, 'scripts/helpers/execute-sheet.mjs');
const PARSER = path.join(QA_RUN_DIR, 'scripts/helpers/drive_sheet_execute.py');
const WORKER_STUB = path.join(QA_RUN_DIR, 'tests/fixtures/sheet-worker-stub.mjs');
const TEMPLATE = path.join(REPO_DIR, 'testcase-template/assets/Template.xlsx');

const pythonReady = spawnSync(
  'python3',
  ['-c', 'import openpyxl, googleapiclient'],
  { encoding: 'utf8' },
).status === 0;

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('Sheet worker integration: runs selected workers and preserves formula-backed testcase IDs', {
  skip: !pythonReady,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-worker-'));
  try {
    const workbook = path.join(tempDir, 'testcases.xlsx');
    fs.copyFileSync(TEMPLATE, workbook);
    const originalDigest = digest(TEMPLATE);

    const execution = spawnSync(
      process.execPath,
      [
        EXECUTOR,
        '--excel-file', workbook,
        '--parallel',
        '--workers', '2',
        '--selected-workers', 'all',
        '--worker-script', WORKER_STUB,
        '--run-id', 'integration',
      ],
      {
        cwd: REPO_DIR,
        encoding: 'utf8',
        env: { ...process.env, QA_DATA_DIR: tempDir },
      },
    );
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.match(execution.stdout, /Selected workers: 1, 2/);
    assert.match(execution.stdout, /Write-back hoàn tất: 4 testcase/);

    const readback = spawnSync(
      'python3',
      [PARSER, 'read', workbook, '--sheet-name', 'Test cases_App'],
      { cwd: REPO_DIR, encoding: 'utf8' },
    );
    assert.equal(readback.status, 0, readback.stderr);
    const parsed = JSON.parse(readback.stdout);
    assert.equal(parsed.header_row, 9);
    assert.equal(parsed.total_testcases, 4);
    assert.deepEqual(
      [...new Set(parsed.testcases.map(({ group }) => group))],
      ['REGISTER', 'LOGIN', 'HOME'],
    );
    assert.ok(parsed.testcases.every(({ result }) => result === 'Pass'));
    assert.ok(parsed.testcases.every(({ testcase_id }) => /^\[NSM-(?:UI-)?\d+\]$/.test(testcase_id)));
    assert.equal(digest(TEMPLATE), originalDigest);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet worker integration: non-interactive run is blocked before write-back without selection', {
  skip: !pythonReady,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-worker-blocked-'));
  try {
    const workbook = path.join(tempDir, 'testcases.xlsx');
    fs.copyFileSync(TEMPLATE, workbook);
    const before = digest(workbook);

    const execution = spawnSync(
      process.execPath,
      [
        EXECUTOR,
        '--excel-file', workbook,
        '--parallel',
        '--workers', '2',
        '--worker-script', WORKER_STUB,
        '--run-id', 'blocked',
      ],
      {
        cwd: REPO_DIR,
        encoding: 'utf8',
        env: { ...process.env, QA_DATA_DIR: tempDir },
      },
    );
    assert.equal(execution.status, 2);
    assert.match(execution.stderr, /Cần xác nhận worker trước khi chạy/);
    assert.equal(digest(workbook), before);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
