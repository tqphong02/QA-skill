import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildPomPlan } from '../assets/templates/scripts/generate-pom-plan.mjs';
import {
  inspectHarArtifact,
  selectionEvaluation,
  stripSqlCommentsAndStrings,
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

function apiGovernance(overrides = {}) {
  return {
    capabilities: ['api'],
    api: { method: 'POST', endpoint: '/orders', expected_status: 201 },
    manual_verification: {
      status: 'PASS',
      environment: 'staging',
      evidence: ['reports/manual-api/orders-create.json'],
      verified_at: '2026-08-30T07:00:00Z',
    },
    risk_profile: {
      criticality: 5,
      money_or_data_impact: 5,
      third_party_dependency: false,
      async_behavior: false,
      recovery_sensitivity: 4,
      dependency_refs: [],
      rationale: 'Order creation changes business data',
    },
    stability_gate: {
      repeat_count: 3,
      required_consecutive_passes: 3,
      max_flaky_rate: 0,
    },
    ...overrides,
  };
}

test('API automation governance fails closed until manual, risk and stability contracts are complete', () => {
  const missing = verifyAdvancedTestContracts({
    plan: { testcases: [{ testcase_id: 'TC_API_GOV_01', capabilities: ['api'], api: {} }] },
  });
  const missingCodes = new Set(missing.violations.map(item => item.code));
  assert.ok(missingCodes.has('MANUAL_VERIFICATION_REQUIRED'));
  assert.ok(missingCodes.has('RISK_PROFILE_REQUIRED'));
  assert.ok(missingCodes.has('STABILITY_GATE_REQUIRED'));

  const blockedManual = apiGovernance({
    testcase_id: 'TC_API_GOV_02',
    manual_verification: { status: 'BLOCKED', environment: 'staging', evidence: [] },
  });
  const blocked = verifyAdvancedTestContracts({ plan: { testcases: [blockedManual] } });
  assert.ok(blocked.violations.some(item => item.code === 'MANUAL_VERIFICATION_NOT_APPROVED'));

  const approved = verifyAdvancedTestContracts({
    plan: { testcases: [{ testcase_id: 'TC_API_GOV_03', ...apiGovernance() }] },
  });
  assert.equal(approved.status, 'PASS', JSON.stringify(approved.violations, null, 2));
});

test('API side-effect prose is blocked and typed side-effect helpers are validated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-side-effect-'));
  try {
    write(root, 'src/shared/helpers/order-side-effect.ts', 'export async function readOrder() { return { status: "CREATED" }; }\n');
    const prose = {
      testcase_id: 'TC_API_SIDE_01',
      ...apiGovernance({ api: { method: 'POST', endpoint: '/orders', expected_status: 201, side_effect: 'Order is stored' } }),
    };
    const proseReport = verifyAdvancedTestContracts({ plan: { testcases: [prose] } });
    assert.ok(proseReport.violations.some(item => item.code === 'API_SIDE_EFFECT_PROSE_UNENFORCED'));

    const typed = {
      testcase_id: 'TC_API_SIDE_02',
      ...apiGovernance({
        api: {
          method: 'POST', endpoint: '/orders', expected_status: 201,
          expected_side_effects: [{
            id: 'SE-ORDER-PERSISTED',
            type: 'READ_AFTER_WRITE',
            description: 'Created order can be read back',
            expected: { status: 'CREATED' },
            implementation_file: 'src/shared/helpers/order-side-effect.ts',
            implementation_export: 'readOrder',
          }],
        },
      }),
    };
    const typedReport = verifyAdvancedTestContracts({
      plan: { testcases: [typed] }, projectRoot: root, checkRuntimeAssets: true,
    });
    assert.equal(typedReport.status, 'PASS', JSON.stringify(typedReport.violations, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

test('extended ROI, recommended layer and custom automation tags fail closed', () => {
  const contract = selection('AUTOMATE');
  contract.recommended_layer = 'API';
  contract.layer_rationale = 'Stable service contract is the cheapest reliable layer';
  contract.extended_roi = {
    build_cost: 2,
    infrastructure_cost: 2,
    feedback_speed_value: 5,
    defect_prevention_value: 5,
    coverage_value: 4,
    reliability_confidence: 5,
  };
  const evaluation = selectionEvaluation({ automation_selection: contract });
  assert.equal(evaluation.status, 'AUTOMATE');
  assert.equal(evaluation.score, 50);
  assert.equal(evaluation.extended_score, 79.17);
  assert.equal(evaluation.recommended_layer, 'API');

  const valid = verifyAdvancedTestContracts({
    plan: { testcases: [{ testcase_id: 'TC_ROI_01', automation_selection: contract, automation_tags: ['@smoke', '@regression'] }] },
  });
  assert.equal(valid.status, 'PASS', JSON.stringify(valid.violations, null, 2));

  const sourceLayer = structuredClone(contract);
  sourceLayer.recommended_layer = 'UNIT';
  const blocked = verifyAdvancedTestContracts({
    plan: { testcases: [{ testcase_id: 'TC_ROI_02', automation_selection: sourceLayer, automation_tags: ['@ui', 'Smoke'] }] },
  });
  const codes = new Set(blocked.violations.map(item => item.code));
  assert.ok(codes.has('SELECTION_LAYER_HANDOFF_REQUIRED'));
  assert.ok(codes.has('AUTOMATION_TAG_INVALID'));
  assert.ok(codes.has('AUTOMATION_TAG_RESERVED'));
});

test('network and direct SQL contracts pass only with bounded runtime assets and declared driver', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-advanced-contracts-'));
  try {
    write(root, 'package.json', JSON.stringify({ dependencies: { pg: '^8.0.0' } }));
    write(root, 'test-data/fixtures/payment-error.json', '{"message":"unavailable"}\n');
    write(root, 'test-data/sql/order-by-id.sql', 'SELECT id, status FROM orders WHERE id = $1\n');
    write(root, 'src/shared/helpers/payment-network.ts', 'export async function setupPaymentFailure() {}\n');
    write(root, 'src/shared/helpers/order-db.ts', 'export async function verifyOrderDb() {}\n');
    write(root, 'src/shared/helpers/test-lifecycle.ts', [
      'export async function prepareTest() {}',
      'export async function releaseTest() {}',
      '',
    ].join('\n'));
    const plan = {
      selection: { available_testcase_ids: ['TC_ADV_01', 'TC_REAL_01'] },
      testcases: [{
        testcase_id: 'TC_ADV_01',
        capabilities: ['ui'],
        automation_selection: selection('AUTOMATE'),
        lifecycle_hooks: {
          before_test: {
            implementation_file: 'src/shared/helpers/test-lifecycle.ts',
            implementation_export: 'prepareTest',
          },
          after_test: {
            implementation_file: 'src/shared/helpers/test-lifecycle.ts',
            implementation_export: 'releaseTest',
          },
        },
        network_interception: {
          mode: 'MOCK',
          routes: [{ pattern: '**/api/payment', action: 'FULFILL', status: 503, fixture_file: 'test-data/fixtures/payment-error.json' }],
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
    assert.equal(report.contracts.lifecycle_hooks, 1);

    const missingCredential = verifyAdvancedTestContracts({
      plan, projectRoot: root, checkRuntimeAssets: true, checkCredentials: true, env: {},
    });
    assert.ok(missingCredential.violations.some(item => item.code === 'DB_CREDENTIAL_MISSING'));
    const availableCredential = verifyAdvancedTestContracts({
      plan, projectRoot: root, checkRuntimeAssets: true, checkCredentials: true, env: { QA_DB_URL: 'redacted-test-value' },
    });
    assert.equal(availableCredential.status, 'PASS', JSON.stringify(availableCredential.violations, null, 2));

    write(root, 'test-data/sql/order-by-id.sql', 'DELETE FROM orders WHERE id = $1\n');
    const blocked = verifyAdvancedTestContracts({ plan, projectRoot: root, checkRuntimeAssets: true });
    assert.equal(blocked.status, 'BLOCKED');
    assert.ok(blocked.violations.some(item => item.code === 'DB_WRITE_SQL_FORBIDDEN'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lifecycle hooks reject unsafe paths, invalid exports and empty contracts', () => {
  const report = verifyAdvancedTestContracts({
    plan: {
      testcases: [
        { testcase_id: 'TC_HOOK_01', lifecycle_hooks: {} },
        {
          testcase_id: 'TC_HOOK_02',
          lifecycle_hooks: {
            before_test: { implementation_file: '../outside.ts', implementation_export: 'beforeTest' },
            after_test: { implementation_file: 'src/shared/helpers/lifecycle.ts', implementation_export: 'not-valid!' },
          },
        },
      ],
    },
  });
  const codes = new Set(report.violations.map(item => item.code));
  assert.ok(codes.has('LIFECYCLE_HOOKS_MISSING'));
  assert.ok(codes.has('LIFECYCLE_IMPLEMENTATION_PATH_INVALID'));
  assert.ok(codes.has('LIFECYCLE_IMPLEMENTATION_EXPORT_INVALID'));
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
  assert.ok(codes.has('HAR_ALLOWED_HOSTS_INVALID'));
});

test('HAR inspection accepts approved hosts and rejects secrets without exposing their values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-har-inspection-'));
  try {
    const safeHar = write(root, 'test-data/hars/safe.har', JSON.stringify({
      log: {
        entries: [{
          request: {
            url: 'https://staging.example.test/api/orders?id=42',
            headers: [{ name: 'accept', value: 'application/json' }],
            cookies: [],
            queryString: [{ name: 'id', value: '42' }],
          },
          response: {
            headers: [{ name: 'content-type', value: 'application/json' }],
            cookies: [],
            content: { text: '{"id":42,"status":"PAID"}' },
          },
        }],
      },
    }));
    const safe = inspectHarArtifact(safeHar, { allowedHosts: ['staging.example.test'] });
    assert.equal(safe.status, 'PASS', JSON.stringify(safe.findings, null, 2));
    assert.equal(safe.entry_count, 1);

    const unsafeHar = write(root, 'test-data/hars/unsafe.har', JSON.stringify({
      log: {
        entries: [{
          request: {
            url: 'https://production.example.test/api/orders?access_token=do-not-print-this',
            headers: [{ name: 'Authorization', value: 'Bearer do-not-print-this' }],
            cookies: [{ name: 'session', value: 'do-not-print-this' }],
            queryString: [{ name: 'access_token', value: 'do-not-print-this' }],
          },
          response: {
            headers: [{ name: 'set-cookie', value: 'session=do-not-print-this' }],
            cookies: [],
            content: { text: '{"refresh_token":"do-not-print-this"}' },
          },
        }],
      },
    }));
    const unsafe = inspectHarArtifact(unsafeHar, { allowedHosts: ['staging.example.test'] });
    const codes = new Set(unsafe.findings.map(item => item.code));
    assert.equal(unsafe.status, 'BLOCKED');
    assert.ok(codes.has('HAR_HOST_NOT_ALLOWED'));
    assert.ok(codes.has('HAR_SENSITIVE_QUERY'));
    assert.ok(codes.has('HAR_SENSITIVE_HEADER'));
    assert.ok(codes.has('HAR_COOKIE_PRESENT'));
    assert.ok(codes.has('HAR_SENSITIVE_BODY_FIELD'));
    assert.equal(JSON.stringify(unsafe).includes('do-not-print-this'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('network mode/action combinations fail closed', () => {
  const report = verifyAdvancedTestContracts({
    plan: {
      selection: { available_testcase_ids: ['TC_NET_01'] },
      testcases: [{
        testcase_id: 'TC_NET_01',
        capabilities: ['ui'],
        network_interception: {
          mode: 'OBSERVE',
          routes: [{ pattern: '**/api/**', action: 'ABORT' }],
          implementation_file: 'src/shared/helpers/network.ts',
          implementation_export: 'observeNetwork',
        },
      }],
    },
  });
  assert.ok(report.violations.some(item => item.code === 'NETWORK_MODE_ACTION_MISMATCH'));
});

test('SQL safety ignores comments/string content but rejects multiple executable statements', () => {
  const normalized = stripSqlCommentsAndStrings("SELECT 'delete and update' AS note FROM orders WHERE id = $1 -- drop table orders");
  assert.equal(/\b(?:delete|update|drop)\b/i.test(normalized), false);
  const executableAfterString = stripSqlCommentsAndStrings("SELECT '-- not a comment'; DELETE FROM orders WHERE id = $1");
  assert.equal(/\bdelete\b/i.test(executableAfterString), true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sql-safety-'));
  try {
    write(root, 'package.json', JSON.stringify({ dependencies: { pg: '^8.0.0' } }));
    write(root, 'test-data/sql/order.sql', "SELECT 'delete' AS note FROM orders WHERE id = $1; SELECT id FROM orders WHERE id = $1\n");
    write(root, 'src/shared/helpers/order-db.ts', 'export async function verifyOrderDb() {}\n');
    const report = verifyAdvancedTestContracts({
      projectRoot: root,
      checkRuntimeAssets: true,
      plan: {
        testcases: [{
          testcase_id: 'TC_SQL_01',
          db_verification: {
            mode: 'DIRECT_SQL', read_only: true, driver: 'pg', credential_env: 'QA_DB_URL',
            query_file: 'test-data/sql/order.sql', parameterized: true,
            implementation_file: 'src/shared/helpers/order-db.ts', implementation_export: 'verifyOrderDb',
          },
        }],
      },
    });
    assert.ok(report.violations.some(item => item.code === 'DB_MULTIPLE_STATEMENTS_FORBIDDEN'));
    assert.equal(report.violations.some(item => item.code === 'DB_WRITE_SQL_FORBIDDEN'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
