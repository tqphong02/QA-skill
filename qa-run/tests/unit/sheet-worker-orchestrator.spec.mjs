import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkerAssignments,
  functionalGroupOf,
  parseWorkerSelection,
  partitionByFunctionalGroup,
  resolveWorkerSelection,
  runWithConcurrency,
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
    /Thiếu evidence/,
  );
});

test('Sheet workers: evidence-backed results are normalized without invented verdicts', () => {
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
        evidence: ['evidence/login-pass.png'],
      },
      {
        row_number: 2,
        result: 'Fail',
        priority: 'Critical',
        note: 'Không chuyển sang Dashboard.',
        evidence: ['evidence/login-fail.png', 'evidence/login-network.json'],
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
        evidence: 'evidence/row-1.png',
      },
    ], assigned),
    /chưa trả kết quả/,
  );
});
