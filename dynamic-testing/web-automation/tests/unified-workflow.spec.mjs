import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSheetResults,
  normalizePlaywrightReport,
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
          { title: 'TC-003 conditional @ui', results: [result('skipped')] },
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
