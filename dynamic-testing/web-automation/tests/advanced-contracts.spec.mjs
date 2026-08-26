import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildPomPlan } from '../assets/templates/scripts/generate-pom-plan.mjs';
import {
  selectionEvaluation,
  verifyAdvancedTestContracts,
} from '../assets/templates/scripts/verify-advanced-test-contracts.mjs';

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

function selection(decision, retirement = { status: 'ACTIVE' }) {
  return {
    decision,
    execution_frequency: 5,
    manual_cost: 4,
    business_risk: 5,
    maintenance_cost: 2,
    rationale: `${decision} by risk/value review`,
    retirement,
  };
}

test('selection contract computes value and excludes DEFER/RETIRED without mapping them to N/A', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-selection-'));
  try {
    const manifestPath = write(root, 'feature.automation.json', JSON.stringify({
      schema_version: 1,
      testcases: [
        { testcase_id: 'TC_SEL_01', group: 'UPLOAD', automation_selection: selection('AUTOMATE') },
        { testcase_id: 'TC_SEL_02', group: 'UPLOAD', automation_selection: selection('DEFER') },
        {
          testcase_id: 'TC_SEL_03', group: 'UPLOAD',
          automation_selection: selection('AUTOMATE', { status: 'RETIRED', date: '2026-08-26', reason: 'feature removed' }),
        },
      ],
    }, null, 2));

    const plan = buildPomPlan(manifestPath);
    assert.deepEqual(plan.testcases.map(item => item.testcase_id), ['TC_SEL_01']);
    assert.equal(plan.testcases[0].automation_value_score, 50);
    assert.deepEqual(plan.selection.excluded.map(item => item.testcase_id), ['TC_SEL_02', 'TC_SEL_03']);
    assert.equal(Object.hasOwn(plan.selection.excluded[0], 'verdict'), false);
    assert.throws(
      () => buildPomPlan(manifestPath, { testcaseIds: ['TC_SEL_02'] }),
      /DEFER, REJECT or RETIRED/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selection contract fails closed on incomplete scoring metadata', () => {
  const result = selectionEvaluation({ automation_selection: { decision: 'AUTOMATE' } });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.violations.some(item => item.includes('maintenance_cost')));
  assert.ok(result.violations.some(item => item.includes('rationale')));
});

test('network and direct SQL contracts pass only with bounded runtime assets and declared driver', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-advanced-contracts-'));
  try {
    write(root, 'package.json', JSON.stringify({ dependencies: { pg: '^8.0.0' } }));
    write(root, 'test-data/fixtures/payment-error.json', '{"message":"unavailable"}\n');
    write(root, 'test-data/sql/order-by-id.sql', 'SELECT id, status FROM orders WHERE id = $1\n');
    write(root, 'src/shared/helpers/payment-network.ts', 'export async function setupPaymentFailure() {}\n');
    write(root, 'src/shared/helpers/order-db.ts', 'export async function verifyOrderDb() {}\n');
    const plan = {
      selection: { available_testcase_ids: ['TC_ADV_01', 'TC_REAL_01'] },
      testcases: [{
        testcase_id: 'TC_ADV_01',
        capabilities: ['ui'],
        automation_selection: selection('AUTOMATE'),
        network_interception: {
          mode: 'MOCK',
          routes: [{ pattern: '**/api/payment', action: 'FULFILL', fixture_file: 'test-data/fixtures/payment-error.json' }],
          real_flow_testcase_id: 'TC_REAL_01',
          implementation_file: 'src/shared/helpers/payment-network.ts',
          implementation_export: 'setupPaymentFailure',
        },
        db_verification: {
          mode: 'DIRECT_SQL',
          read_only: true,
          scope: 'RECORD',
          driver: 'pg',
          credential_env: 'QA_DB_URL',
          query_file: 'test-data/sql/order-by-id.sql',
          parameterized: true,
          implementation_file: 'src/shared/helpers/order-db.ts',
          implementation_export: 'verifyOrderDb',
          polling: { timeout_ms: 10_000, intervals_ms: [500, 1000] },
        },
      }],
    };

    const report = verifyAdvancedTestContracts({ plan, projectRoot: root, checkRuntimeAssets: true });
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));

    write(root, 'test-data/sql/order-by-id.sql', 'DELETE FROM orders WHERE id = $1\n');
    const blocked = verifyAdvancedTestContracts({ plan, projectRoot: root, checkRuntimeAssets: true });
    assert.equal(blocked.status, 'BLOCKED');
    assert.ok(blocked.violations.some(item => item.code === 'DB_WRITE_SQL_FORBIDDEN'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('HAR contract requires sanitization, service-worker blocking and a real-flow sibling', () => {
  const report = verifyAdvancedTestContracts({
    plan: {
      selection: { available_testcase_ids: ['TC_HAR_01'] },
      testcases: [{
        testcase_id: 'TC_HAR_01',
        capabilities: ['ui'],
        network_interception: {
          mode: 'HAR',
          routes: [{ pattern: '**/api/**', action: 'HAR' }],
          har_file: '../secret.har',
          implementation_file: 'src/shared/helpers/network.ts',
          implementation_export: 'setupHar',
        },
      }],
    },
  });
  assert.equal(report.status, 'BLOCKED');
  const codes = new Set(report.violations.map(item => item.code));
  assert.ok(codes.has('HAR_SANITIZATION_UNCONFIRMED'));
  assert.ok(codes.has('HAR_SERVICE_WORKERS_NOT_BLOCKED'));
  assert.ok(codes.has('REAL_FLOW_TESTCASE_REQUIRED'));
  assert.ok(codes.has('HAR_PATH_INVALID'));
});
