import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseApiCoverageArgs,
  verifyApiOperationCoverage,
} from '../assets/templates/scripts/verify-api-operation-coverage.mjs';

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(TEST_ROOT, '../assets/templates');

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function operation(overrides = {}) {
  return {
    method: 'POST',
    path: '/widgets',
    operation: 'createWidget',
    required: true,
    mutates: true,
    testcase_id: 'TC-API-WIDGET-CREATE-001',
    spec: 'tests/api/widgets.api.spec.ts',
    client: { type: 'ApiClient', fixture: 'authenticatedApi', method: 'post' },
    auth: { mode: 'bearer', role: 'admin' },
    expected_status: [201],
    schemas: { request: 'CreateWidgetSchema', response: 'WidgetSchema', error: null },
    cleanup: {
      required: true,
      owner: 'same_test',
      client: 'authenticatedApi',
      method: 'delete',
      path: '/widgets/{id}',
    },
    ...overrides,
  };
}

function validSpec() {
  return `
import { test, expect } from '../../fixtures/pom';
import { ApiClient } from '../../fixtures/api-client';
const CreateWidgetSchema = {};
const WidgetSchema = {};
test('TC-API-WIDGET-CREATE-001 | POST /widgets | createWidget @api', async ({ authenticatedApi }) => {
  test.info().annotations.push(
    { type: 'api-operation', description: '[TC-API-WIDGET-CREATE-001:API] POST /widgets createWidget' },
    { type: 'contract', description: '[TC-API-WIDGET-CREATE-001:ROLE] admin' },
    { type: 'contract', description: '[TC-API-WIDGET-CREATE-001:CLEANUP] DELETE /widgets/{id} same_test' },
  );
  const payload = ApiClient.validate(CreateWidgetSchema, { name: 'owned' });
  let id;
  try {
    const response = await authenticatedApi.post('/widgets', payload);
    expect(response.status()).toBe(201);
    const widget = ApiClient.validate(WidgetSchema, await response.json());
    id = widget.id;
  } finally {
    if (id) await authenticatedApi.delete(\`/widgets/\${id}\`);
  }
});
`;
}

function projectFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-operation-coverage-'));
  write(root, 'tests/api/widgets.api.spec.ts', validSpec());
  write(root, 'tests/api/api-operation-inventory.json', JSON.stringify({
    schema_version: 1,
    operations: [operation()],
  }, null, 2));
  return root;
}

test('template API operation inventory is fully covered across API and functional specs', () => {
  const report = verifyApiOperationCoverage({ projectRoot: TEMPLATE_ROOT });
  assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
  assert.equal(report.coverage_percent, 100);
  assert.equal(report.covered_operation_count, 4);
  assert.ok(report.operations.every(item => (
    item.client.fixture
    && item.auth.role
    && item.expected_status.length > 0
    && Object.hasOwn(item.schemas, 'request')
    && typeof item.cleanup.required === 'boolean'
  )));
});

test('coverage fails closed when schema validation and finally cleanup are absent', () => {
  const root = projectFixture();
  try {
    const specPath = path.join(root, 'tests/api/widgets.api.spec.ts');
    const broken = fs.readFileSync(specPath, 'utf8')
      .replace('const widget = ApiClient.validate(WidgetSchema, await response.json());', 'const widget = await response.json();')
      .replace(/\s*finally \{[\s\S]*?\n  \}\n\}\);/, '\n});');
    fs.writeFileSync(specPath, broken, 'utf8');
    const report = verifyApiOperationCoverage({ projectRoot: root });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => item.code === 'API_SCHEMA_VALIDATION_MISSING'));
    assert.ok(report.violations.some(item => item.code === 'API_CLEANUP_IMPLEMENTATION_MISSING'));
    assert.ok(report.violations.some(item => item.code === 'API_OPERATION_COVERAGE_INCOMPLETE'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('coverage blocks API tests that are not mapped by the inventory', () => {
  const root = projectFixture();
  try {
    const specPath = path.join(root, 'tests/api/widgets.api.spec.ts');
    fs.appendFileSync(specPath, `
test('TC-API-WIDGET-LIST-001 | GET /widgets | listWidgets @api', async ({ api }) => {
  test.info().annotations.push({
    type: 'api-operation',
    description: '[TC-API-WIDGET-LIST-001:API] GET /widgets listWidgets',
  });
  const response = await api.get('/widgets');
  expect(response.status()).toBe(200);
});
`);
    const report = verifyApiOperationCoverage({ projectRoot: root });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => (
      item.code === 'API_TEST_UNMAPPED'
      && item.testcase_id === 'TC-API-WIDGET-LIST-001'
    )));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scoped coverage evaluates only the selected testcase while full mode remains strict', () => {
  const root = projectFixture();
  try {
    const inventoryPath = path.join(root, 'tests/api/api-operation-inventory.json');
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    inventory.operations.push(operation({
      method: 'GET',
      path: '/missing',
      operation: 'missingOperation',
      mutates: false,
      testcase_id: 'TC-API-MISSING-001',
      spec: 'tests/api/missing.api.spec.ts',
      client: { type: 'ApiClient', fixture: 'api', method: 'get' },
      auth: { mode: 'none', role: 'unauthenticated' },
      expected_status: [404],
      schemas: { request: null, response: null, error: 'ApiErrorSchema' },
      cleanup: { required: false, reason: 'Read-only negative operation' },
    }));
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

    const scoped = verifyApiOperationCoverage({
      projectRoot: root,
      testcaseIds: ['TC-API-WIDGET-CREATE-001'],
    });
    assert.equal(scoped.status, 'PASS', JSON.stringify(scoped.violations, null, 2));
    assert.equal(scoped.mode, 'scoped');
    assert.equal(scoped.selected_operation_count, 1);

    const full = verifyApiOperationCoverage({ projectRoot: root });
    assert.equal(full.status, 'BLOCKED');
    assert.ok(full.violations.some(item => item.code === 'API_SPEC_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI parser supports repeatable/comma-separated exact scope options', () => {
  const parsed = parseApiCoverageArgs([
    '--project-root', 'automation',
    '--inventory', 'testcases/api.json',
    '--output', 'reports/api.json',
    '--testcase-id', 'TC-1,TC-2',
    '--testcase-id', 'TC-3',
    '--operation', 'createUser,listUsers',
  ]);
  assert.deepEqual(parsed.testcaseIds, ['TC-1', 'TC-2', 'TC-3']);
  assert.deepEqual(parsed.operationIds, ['createUser', 'listUsers']);
  assert.equal(parsed.inventoryPath, 'testcases/api.json');
});
