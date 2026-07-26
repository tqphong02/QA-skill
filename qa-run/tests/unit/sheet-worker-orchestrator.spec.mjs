import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildWorkerAssignments,
  evidenceSlug,
  functionalGroupOf,
  isVisualEvidenceReference,
  parseWorkerSelection,
  partitionByFunctionalGroup,
  resolveFunctionalGroupNames,
  resolveModuleConfirmation,
  resolveWorkerCount,
  resolveWorkerSelection,
  runWithConcurrency,
  sheetFunctionalEvidenceDir,
  validateWorkerResults,
} from '../../scripts/helpers/execute-sheet.mjs';

function testcase(row, group, overrides = {}) {
  return {
    row_number: row,
    testcase_id: `TC-${String(row).padStart(3, '0')}`,
    group,
    scenario_name: `Scenario ${group}`,
    module: '1.2. FUNCTION',
    priority: 'Medium',
    ...overrides,
  };
}

test('Sheet workers: functional group is preferred over scenario and section module', () => {
  assert.equal(functionalGroupOf(testcase(1, 'LOGIN')), 'LOGIN');
});

test('Sheet workers: evidence path is grouped by function, date, run, and worker', () => {
  assert.equal(evidenceSlug('Đăng nhập / SSO'), 'dang-nhap-sso');
  assert.equal(
    sheetFunctionalEvidenceDir(
      'Đăng nhập / SSO',
      '2026-07-26',
      'run 01',
      2,
      '/tmp/evidence',
    ),
    '/tmp/evidence/sheet/dang-nhap-sso/2026-07-26/run-01/worker-2',
  );
});

test('Sheet workers: every assignment contains at most two functional groups', () => {
  const cases = Array.from({ length: 10 }, (_, index) => testcase(index + 1, `GROUP-${index + 1}`));
  const groups = partitionByFunctionalGroup(cases);
  const assignments = buildWorkerAssignments(groups, {
    parallel: true,
    runId: 'test-run',
  });

  assert.equal(assignments.length, 5);
  assert.ok(assignments.every(({ functional_groups }) => functional_groups.length <= 2));
  assert.deepEqual(
    assignments.flatMap(({ functional_groups }) => functional_groups),
    cases.map(({ group }) => group),
  );
});

test('Sheet workers: one LOGIN module is sharded across the confirmed worker count', () => {
  const cases = Array.from({ length: 7 }, (_, index) => testcase(index + 1, 'LOGIN'));
  const assignments = buildWorkerAssignments(partitionByFunctionalGroup(cases), {
    parallel: true,
    desiredWorkers: 3,
    runId: 'login-run',
    runDate: '2026-07-26',
  });

  assert.equal(assignments.length, 3);
  assert.ok(assignments.every(({ functional_groups }) => (
    functional_groups.length === 1 && functional_groups[0] === 'LOGIN'
  )));
  assert.equal(assignments.reduce((total, item) => total + item.testcase_count, 0), 7);
  assert.equal(new Set(assignments.flatMap(({ testcases }) => testcases.map(({ row_number }) => row_number))).size, 7);
  assert.ok(assignments.every(({ id, testcases }) => testcases.every(
    ({ evidence_directory }) => evidence_directory.endsWith(
      `/evidence/sheet/login/2026-07-26/login-run/worker-${id}`,
    ),
  )));
});

test('Sheet workers: requested module resolves exactly and must be explicitly confirmed', async () => {
  const groups = partitionByFunctionalGroup([
    testcase(1, 'LOGIN'),
    testcase(2, 'REGISTER'),
  ]);
  const requested = resolveFunctionalGroupNames(groups, 'login');
  assert.deepEqual(requested, ['LOGIN']);
  assert.deepEqual(
    await resolveModuleConfirmation(groups, requested, {
      confirmedModule: 'LOGIN',
      interactive: false,
    }),
    ['LOGIN'],
  );
  await assert.rejects(
    resolveModuleConfirmation(groups, requested, { interactive: false }),
    /Cần xác nhận module/,
  );
  await assert.rejects(
    resolveModuleConfirmation(groups, requested, {
      confirmedModule: 'REGISTER',
      interactive: false,
    }),
    /không khớp scope/,
  );
});

test('Sheet workers: worker count is prompted or explicitly provided', async () => {
  let askCount = 0;
  assert.equal(
    await resolveWorkerCount({
      interactive: true,
      recommended: 2,
      ask: async () => {
        askCount += 1;
        return '3';
      },
    }),
    3,
  );
  assert.equal(askCount, 1);
  assert.equal(await resolveWorkerCount({ workers: '2', interactive: false }), 2);
  await assert.rejects(
    resolveWorkerCount({ interactive: false }),
    /Cần xác nhận số worker/,
  );
});

test('Sheet workers: explicit worker selection supports all and selected IDs', () => {
  const assignments = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ];

  assert.deepEqual(parseWorkerSelection('all', assignments), assignments);
  assert.deepEqual(
    parseWorkerSelection('worker #1, 3', assignments).map(({ id }) => id),
    [1, 3],
  );
  assert.throws(() => parseWorkerSelection('4', assignments), /không tồn tại/);
});

test('Sheet workers: interactive execution asks before selecting workers', async () => {
  const assignments = [{ id: 1 }, { id: 2 }];
  let askCount = 0;
  const selected = await resolveWorkerSelection(assignments, {
    interactive: true,
    ask: async () => {
      askCount += 1;
      return '2';
    },
  });

  assert.equal(askCount, 1);
  assert.deepEqual(selected.map(({ id }) => id), [2]);
});

test('Sheet workers: non-interactive execution is blocked without explicit selection', async () => {
  await assert.rejects(
    resolveWorkerSelection([{ id: 1 }], { interactive: false }),
    /Cần xác nhận worker/,
  );
});

test('Sheet workers: concurrency limit is used by real asynchronous tasks', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return value * 2;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});

test('Sheet workers: Pass or Fail without evidence is rejected', () => {
  const assigned = [testcase(1, 'LOGIN')];
  assert.throws(
    () => validateWorkerResults([
      {
        row_number: 1,
        result: 'Pass',
        priority: 'High',
      },
    ], assigned),
    /Thiếu evidence hình ảnh\/video/,
  );
});

test('Sheet workers: JSON evidence alone is rejected for Pass or Fail', () => {
  const assigned = [testcase(1, 'LOGIN')];
  assert.throws(
    () => validateWorkerResults([
      {
        row_number: 1,
        result: 'Pass',
        priority: 'High',
        evidence: 'https://evidence.example/login-network.json',
      },
    ], assigned),
    /Thiếu evidence hình ảnh\/video/,
  );
});

test('Sheet workers: local visual evidence outside the assigned function/date folder is rejected', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-evidence-path-'));
  try {
    const expectedDir = path.join(tempDir, 'evidence/sheet/login/2026-07-26/run-01/worker-1');
    const wrongDir = path.join(tempDir, 'evidence/sheet/register/2026-07-26/run-01/worker-1');
    fs.mkdirSync(wrongDir, { recursive: true });
    const wrongEvidence = path.join(wrongDir, 'login-pass.png');
    fs.writeFileSync(wrongEvidence, 'image');

    assert.throws(
      () => validateWorkerResults([
        {
          row_number: 1,
          result: 'Pass',
          priority: 'High',
          evidence: wrongEvidence,
        },
      ], [testcase(1, 'LOGIN', { evidence_directory: expectedDir })]),
      /sai thư mục chức năng\/ngày/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Sheet workers: image or video evidence is recognized', () => {
  assert.equal(isVisualEvidenceReference('https://evidence.example/login.png'), true);
  assert.equal(isVisualEvidenceReference('video:https://drive.google.com/file/d/123'), true);
  assert.equal(isVisualEvidenceReference('evidence/network.json'), false);
});

test('Sheet workers: visual evidence-backed results are normalized without invented verdicts', () => {
  const assigned = [
    testcase(1, 'LOGIN'),
    testcase(2, 'LOGIN'),
  ];
  const validated = validateWorkerResults({
    results: [
      {
        row_number: 1,
        result: 'Pass',
        priority: 'High',
        evidence: ['https://evidence.example/login-pass.png'],
      },
      {
        row_number: 2,
        result: 'Fail',
        priority: 'Critical',
        note: 'Không chuyển sang Dashboard.',
        evidence: [
          'https://evidence.example/login-fail.mp4',
          'https://evidence.example/login-network.json',
        ],
      },
    ],
  }, assigned);

  assert.deepEqual(validated.map(({ result }) => result), ['Pass', 'Fail']);
  assert.equal(validated[1].note, 'Không chuyển sang Dashboard');
  assert.equal(validated[1].evidence.length, 2);
});

test('Sheet workers: incomplete result set is rejected before write-back', () => {
  const assigned = [
    testcase(1, 'LOGIN'),
    testcase(2, 'LOGIN'),
  ];
  assert.throws(
    () => validateWorkerResults([
      {
        row_number: 1,
        result: 'Pass',
        priority: 'Medium',
        evidence: 'https://evidence.example/row-1.png',
      },
    ], assigned),
    /chưa trả kết quả/,
  );
});
