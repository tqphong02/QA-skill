import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyAllureContractGate,
  applyRunnerProcessGate,
  assertBoundedPlan,
  assertPlanSupportsMode,
  assertProjectOutputPath,
  buildSheetResults,
  loadImmutablePlan,
  normalizePlaywrightReport,
  stabilityRepeatCount,
  surfaceTestPath,
  testcaseGrep,
  verifyStabilityGate,
} from '../assets/templates/scripts/run-testcase-pom.mjs';

function planFor(ids) {
  return {
    source_manifest: 'feature.automation.json',
    source_manifest_sha256: 'fixture-hash',
    testcases: ids.map((id, index) => ({
      testcase_id: id,
      group: 'LOGIN',
      scenario_id: `SCN-${index + 1}`,
      requirement: `AC-${index + 1}`,
      priority: 'High',
    })),
  };
}

function result(status, screenshot, trace, duration = 10) {
  return {
    status,
    duration,
    attachments: [
      ...(screenshot ? [{ name: 'screenshot', path: screenshot }] : []),
      ...(trace ? [{ name: 'trace', path: trace }] : []),
    ],
  };
}

test('unified workflow maps browser execution to evidence-gated testcase verdicts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-pom-'));
  try {
    const screenshot = path.join(root, 'evidence.png');
    const trace = path.join(root, 'trace.zip');
    fs.writeFileSync(screenshot, 'image');
    fs.writeFileSync(trace, 'trace');
    const report = {
      suites: [{
        title: 'feature',
        tests: [
          { title: 'TC-001 happy @ui', results: [result('passed', screenshot, trace)] },
          { title: 'TC-002 negative @ui', results: [result('failed', screenshot, trace)] },
          {
            title: 'TC-003 conditional @ui',
            annotations: [{ type: 'skip', description: 'N/A: feature is disabled for this tenant' }],
            results: [result('skipped')],
          },
          { title: 'TC-004 timeout @ui', results: [result('timedOut')] },
          {
            title: 'TC-005 flaky @ui',
            results: [result('failed', screenshot, trace), result('passed', screenshot, trace)],
          },
        ],
      }],
    };

    const normalized = normalizePlaywrightReport(
      report,
      planFor(['TC-001', 'TC-002', 'TC-003', 'TC-004', 'TC-005']),
      { projectRoot: root, mode: 'ui', runId: 'unified-run' },
    );
    assert.equal(normalized.verdict, 'FAILED');
    assert.deepEqual(normalized.results.map(item => item.verdict), [
      'PASS', 'FAILED', 'N/A', 'UNTEST', 'FAILED',
    ]);
    assert.equal(normalized.results[4].flaky, true);
    assert.deepEqual(normalized.results.map(item => item.sheet_result), [
      'Pass', 'Fail', 'N/A', 'Untest', 'Fail',
    ]);
    assert.equal(normalized.summary.pass, 1);
    assert.equal(normalized.summary.failed, 2);
    assert.equal(normalized.summary.untest, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified workflow reads the real Playwright JSON reporter suites/specs/tests shape', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-pom-json-'));
  try {
    const screenshot = path.join(root, 'evidence.png');
    const trace = path.join(root, 'trace.zip');
    fs.writeFileSync(screenshot, 'image');
    fs.writeFileSync(trace, 'trace');
    const normalized = normalizePlaywrightReport({
      suites: [{
        title: 'login.spec.ts',
        specs: [{
          title: 'TC-JSON-01 login succeeds @ui',
          tests: [{
            projectName: 'chromium',
            results: [result('passed', screenshot, trace)],
          }],
        }],
      }],
    }, planFor(['TC-JSON-01']), { projectRoot: root, mode: 'ui' });

    assert.equal(normalized.verdict, 'PASS');
    assert.equal(normalized.results[0].verdict, 'PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified UI workflow refuses PASS without visual and same-session trace evidence', () => {
  const normalized = normalizePlaywrightReport({
    suites: [{ tests: [{ title: 'TC-010 @ui', results: [result('passed')] }] }],
  }, planFor(['TC-010']), { mode: 'ui' });

  assert.equal(normalized.verdict, 'UNTEST');
  assert.match(normalized.results[0].note, /Thiếu screenshot\/video.*trace/);
});

test('unified API workflow can PASS without browser-only visual evidence', () => {
  const normalized = normalizePlaywrightReport({
    suites: [{ tests: [{ title: 'TC-API-01 @api', results: [result('passed')] }] }],
  }, planFor(['TC-API-01']), { mode: 'api' });

  assert.equal(normalized.verdict, 'PASS');
});

test('pre-CI stability gate requires repeated clean passes and preserves attempt evidence', () => {
  const plan = planFor(['TC-STABLE-01']);
  plan.testcases[0].stability_gate = {
    repeat_count: 3,
    required_consecutive_passes: 3,
    max_flaky_rate: 0,
  };
  assert.equal(stabilityRepeatCount(plan), 3);

  const passed = verifyStabilityGate({
    suites: [{ tests: [0, 1, 2].map(repeatEachIndex => ({
      title: 'TC-STABLE-01 @api', repeatEachIndex, results: [result('passed')],
    })) }],
  }, plan);
  assert.equal(passed.status, 'PASS', JSON.stringify(passed, null, 2));
  assert.equal(passed.cases[0].actual_execution_count, 3);
  assert.equal(passed.cases[0].consecutive_clean_passes, 3);

  const flaky = verifyStabilityGate({
    suites: [{ tests: [
      { title: 'TC-STABLE-01 @api', repeatEachIndex: 0, results: [result('passed')] },
      { title: 'TC-STABLE-01 @api', repeatEachIndex: 1, results: [result('failed'), result('passed')] },
      { title: 'TC-STABLE-01 @api', repeatEachIndex: 2, results: [result('passed')] },
    ] }],
  }, plan);
  assert.equal(flaky.status, 'BLOCKED');
  assert.ok(flaky.cases[0].violations.includes('STABILITY_CONSECUTIVE_PASS_NOT_MET'));
  assert.ok(flaky.cases[0].violations.includes('STABILITY_FLAKY_RATE_EXCEEDED'));
});

test('unmarked Playwright skips remain UNTEST instead of becoming N/A', () => {
  const normalized = normalizePlaywrightReport({
    suites: [{ tests: [{ title: 'TC-SKIP-01 @api', results: [result('skipped')] }] }],
  }, planFor(['TC-SKIP-01']), { mode: 'api' });

  assert.equal(normalized.verdict, 'UNTEST');
  assert.match(normalized.results[0].note, /không có annotation N\/A/);
});

test('unified workflow projects the same verdicts into Sheet write-back rows', () => {
  const execution = {
    run_id: 'sheet-run',
    results: [{
      testcase_id: 'TC-020',
      sheet_result: 'Pass',
      priority: 'High',
      note: 'Playwright hoàn tất và assertion đạt',
      evidence: { visual: ['/evidence/pass.png'], observer: ['/evidence/trace.zip'] },
    }],
  };
  const sheet = buildSheetResults(execution, {
    assignments: [{ testcases: [{ row_number: 20, testcase_id: '[TC-020]' }] }],
  });

  assert.equal(sheet.results[0].row_number, 20);
  assert.equal(sheet.results[0].result, 'Pass');
  assert.deepEqual(sheet.results[0].evidence, ['/evidence/pass.png', '/evidence/trace.zip']);
});

test('unified runner selects exact testcase IDs within the requested surface', () => {
  const pattern = new RegExp(testcaseGrep(['TC-1']));
  assert.equal(pattern.test('TC-1 @api'), true);
  assert.equal(pattern.test('TC-10 @api'), false);
  assert.equal(pattern.test('prefix-TC-1-extra'), false);
  assert.equal(surfaceTestPath('api'), 'tests/api');
  assert.throws(() => surfaceTestPath('uii'), /unsupported --mode/);
});

test('unified runner blocks a surface that testcase capabilities do not support', () => {
  const plan = {
    testcases: [
      { testcase_id: 'TC-UI', capabilities: ['ui'] },
      { testcase_id: 'TC-API', capabilities: ['api'] },
    ],
  };
  assert.throws(() => assertPlanSupportsMode(plan, 'api'), /TC-UI/);
  assert.throws(() => assertPlanSupportsMode(plan, 'functional'), /TC-UI, TC-API/);
  assert.doesNotThrow(() => assertPlanSupportsMode({
    testcases: [{ testcase_id: 'TC-E2E', capabilities: ['ui', 'api'] }],
  }, 'functional'));
});

test('unified runner accepts only one bounded immutable business module plan', () => {
  const valid = {
    source_manifest_sha256: 'a'.repeat(64),
    module: { group: 'LOGIN', slug: 'login' },
    testcases: [{ testcase_id: 'TC-1', group: 'LOGIN' }],
  };
  assert.equal(assertBoundedPlan(valid), valid);
  assert.throws(() => assertBoundedPlan({
    ...valid,
    module: null,
    testcases: [
      { testcase_id: 'TC-1', group: 'LOGIN' },
      { testcase_id: 'TC-2', group: 'ORDERS' },
    ],
  }), /exactly one resolved business module/);
  assert.throws(() => assertBoundedPlan({
    ...valid,
    testcases: Array.from({ length: 21 }, (_, index) => ({
      testcase_id: `TC-${index + 1}`,
      group: 'LOGIN',
    })),
  }), /1-20 testcases/);
});

test('RUN rejects a stale plan when the automation manifest changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-immutable-plan-'));
  try {
    const manifestPath = path.join(root, 'login.automation.json');
    const planPath = path.join(root, 'login.pom-plan.json');
    fs.writeFileSync(manifestPath, '{"schema_version":1}\n', 'utf8');
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
    fs.writeFileSync(planPath, JSON.stringify({
      source_manifest_sha256: sourceHash,
      module: { group: 'LOGIN', slug: 'login' },
      testcases: [{ testcase_id: 'TC-1', group: 'LOGIN', capabilities: ['api'] }],
    }), 'utf8');
    assert.equal(loadImmutablePlan(planPath, manifestPath, { mode: 'api' }).testcases.length, 1);
    fs.writeFileSync(manifestPath, '{"schema_version":2}\n', 'utf8');
    assert.throws(
      () => loadImmutablePlan(planPath, manifestPath, { mode: 'api' }),
      /source hash does not match/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified runner refuses output paths at or outside project-root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-output-root-'));
  try {
    assert.throws(() => assertProjectOutputPath(root, root, '--output'), /must stay below project-root/);
    assert.throws(
      () => assertProjectOutputPath(root, path.resolve(root, '..', 'outside.json'), '--output'),
      /must stay below project-root/,
    );
    assert.equal(
      assertProjectOutputPath(root, path.join(root, 'reports', 'result.json')),
      path.join(root, 'reports', 'result.json'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified runner refuses an output directory symlinked outside project-root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-output-link-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-output-link-outside-'));
  const linked = path.join(root, 'linked-reports');
  try {
    try {
      fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip(`symlink unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(
      () => assertProjectOutputPath(root, path.join(linked, 'result.json'), '--output'),
      /resolves outside project-root through a link/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('API verdict is UNTEST when the canonical Allure contract is blocked', () => {
  const report = normalizePlaywrightReport({
    suites: [{ tests: [{ title: 'TC-API-02 @api', results: [result('passed')] }] }],
  }, planFor(['TC-API-02']), { mode: 'api' });

  applyAllureContractGate(report, {
    status: 'BLOCKED',
    violations: [{ message: 'missing account parameter' }],
  }, 'api');

  assert.equal(report.verdict, 'UNTEST');
  assert.equal(report.results[0].verdict, 'UNTEST');
  assert.match(report.results[0].note, /missing account parameter/);
});

test('runner process errors cannot retain a PASS verdict from a partial report', () => {
  const report = normalizePlaywrightReport({
    suites: [{ tests: [{ title: 'TC-API-03 @api', results: [result('passed')] }] }],
  }, planFor(['TC-API-03']), { mode: 'api' });

  applyRunnerProcessGate(report, { status: null, signal: null, error: new Error('spawn ENOBUFS') });

  assert.equal(report.verdict, 'UNTEST');
  assert.match(report.results[0].note, /spawn ENOBUFS/);
});
