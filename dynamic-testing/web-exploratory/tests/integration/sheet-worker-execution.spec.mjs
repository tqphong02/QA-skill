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
const REPO_DIR = path.resolve(QA_RUN_DIR, '..', '..');
const EXECUTOR = path.join(QA_RUN_DIR, 'scripts/helpers/execute-sheet.mjs');
const PARSER = path.join(QA_RUN_DIR, 'scripts/helpers/drive_sheet_execute.py');
const WORKER_STUB = path.join(QA_RUN_DIR, 'tests/fixtures/sheet-worker-stub.mjs');
const TEMPLATE = path.join(REPO_DIR, 'support/testcase-authoring/assets/Template.xlsx');
const TEST_RUN_DATE = '2026-07-26';

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
        '--confirmed-module', 'all',
        '--workers', '2',
        '--selected-workers', 'all',
        '--worker-script', WORKER_STUB,
        '--run-id', 'integration',
        '--run-date', TEST_RUN_DATE,
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
    assert.ok(parsed.testcases.some(({ result }) => result === 'Pass'));
    assert.ok(parsed.testcases.some(({ result }) => result === 'Fail'));
    assert.ok(parsed.testcases.every(({ note }) => note.includes('.png')));
    assert.ok(parsed.testcases.every(({ group, note }) => (
      note.includes(
        `/evidence/sheet/${group.toLowerCase()}/${TEST_RUN_DATE}/integration/worker-`,
      )
    )));
    assert.ok(parsed.testcases.every(({ testcase_id }) => /^\[NSM-(?:UI-)?\d+\]$/.test(testcase_id)));
    assert.equal(
      fs.existsSync(path.join(tempDir, 'evidence/sheet/_runs', TEST_RUN_DATE, 'integration')),
      true,
    );
    assert.equal(fs.existsSync(path.join(tempDir, 'evidence/runs/integration')), false);
    assert.equal(digest(TEMPLATE), originalDigest);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet worker integration: LOGIN plan exposes resolved module and required confirmations', {
  skip: !pythonReady,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-login-plan-'));
  try {
    const execution = spawnSync(
      process.execPath,
      [
        EXECUTOR,
        '--excel-file', TEMPLATE,
        '--module', 'LOGIN',
        '--parallel',
        '--plan-only',
        '--run-id', 'login-plan',
        '--run-date', TEST_RUN_DATE,
      ],
      {
        cwd: REPO_DIR,
        encoding: 'utf8',
        env: { ...process.env, QA_DATA_DIR: tempDir },
      },
    );
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.match(execution.stdout, /Requested: LOGIN/);
    assert.match(execution.stdout, /Resolved: \[LOGIN\]/);
    assert.match(execution.stdout, /xác nhận module \[LOGIN\], số worker 1-4/);

    const plan = JSON.parse(fs.readFileSync(
      path.join(
        tempDir,
        'evidence/sheet/_runs',
        TEST_RUN_DATE,
        'login-plan/sheet-worker-plan.json',
      ),
      'utf8',
    ));
    assert.equal(plan.run_date, TEST_RUN_DATE);
    assert.deepEqual(plan.module_scope.resolved_functional_groups, ['LOGIN']);
    assert.deepEqual(plan.evidence_layout, {
      media: 'evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/',
      run_metadata: 'evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/',
    });
    assert.ok(plan.assignments.every(({ testcases }) => testcases.every(
      ({ evidence_directory }) => evidence_directory.includes(
        `/evidence/sheet/login/${TEST_RUN_DATE}/login-plan/worker-`,
      ),
    )));
    assert.deepEqual(plan.confirmation_required, {
      module_scope: true,
      worker_count: true,
      worker_selection: true,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet worker integration: non-interactive run is blocked without module confirmation', {
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
    assert.match(execution.stderr, /Cần xác nhận module trước khi chạy/);
    assert.equal(digest(workbook), before);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet worker integration: non-interactive run is blocked without confirmed worker count', {
  skip: !pythonReady,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-worker-count-blocked-'));
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
        '--confirmed-module', 'all',
        '--selected-workers', 'all',
        '--worker-script', WORKER_STUB,
        '--run-id', 'worker-count-blocked',
      ],
      {
        cwd: REPO_DIR,
        encoding: 'utf8',
        env: { ...process.env, QA_DATA_DIR: tempDir },
      },
    );
    assert.equal(execution.status, 2);
    assert.match(execution.stderr, /Cần xác nhận số worker trước khi chạy/);
    assert.equal(digest(workbook), before);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet worker integration: non-interactive run is blocked without worker selection', {
  skip: !pythonReady,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-worker-selection-blocked-'));
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
        '--confirmed-module', 'all',
        '--workers', '2',
        '--worker-script', WORKER_STUB,
        '--run-id', 'selection-blocked',
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
