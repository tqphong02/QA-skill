import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GENERATED_MARKER,
  generatePomCode,
  loadPomPlans,
} from '../assets/templates/scripts/generate-pom-code.mjs';
import { verifyModuleArtifactLayout } from '../assets/templates/scripts/verify-module-artifact-layout.mjs';
import { verifyApiOperationCoverage } from '../assets/templates/scripts/verify-api-operation-coverage.mjs';

const SOURCE_HASH = 'a'.repeat(64);

function writeJson(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function moduleRecord() {
  return { group: 'LOGIN', slug: 'login' };
}

function uiCase(id = 'LOGIN-UI-01', sourceIndex = 0) {
  return {
    testcase_id: id,
    source_index: sourceIndex,
    group: 'LOGIN',
    capabilities: ['ui'],
    scenario_id: `SCN-${id}`,
    type: 'happy',
    entry: { route: '/login', role_key: 'guest' },
    required_markers: {
      role: `[${id}:ROLE] guest`,
      rbac: [],
      cleanup: null,
    },
    steps: [{
      order: 1,
      id: 'S01',
      marker: `[${id}:S01] fill email_input value=fixture`,
      action: 'fill',
      required_method: 'fillEmailInput',
      target_key: 'email_input',
      target_hints: { key: 'email_input', kind: 'field', name: 'Email' },
      value: 'qa@example.test',
      wait_for: null,
      assertions: [{
        marker: `[${id}:S01:ASSERT:01] value email_input`,
        assertion: { kind: 'value', target: 'email_input', value: 'qa@example.test' },
        required_matchers: ['toHaveValue'],
      }],
    }],
    outcome_assertions: [{
      marker: `[${id}:OUTCOME:01] visible dashboard_heading`,
      assertion: { kind: 'visible', target: 'dashboard_heading' },
      required_matchers: ['toBeVisible'],
    }],
    outcome_route: '/dashboard',
    cleanup: null,
    mutates: false,
    selector_target_keys: ['email_input', 'dashboard_heading'],
  };
}

function apiCase(id = 'LOGIN-API-01', sourceIndex = 0) {
  return {
    testcase_id: id,
    source_index: sourceIndex,
    group: 'LOGIN',
    capabilities: ['api'],
    scenario_id: `SCN-${id}`,
    type: 'happy',
    required_markers: { role: null, rbac: [], cleanup: null },
    steps: [],
    outcome_assertions: [],
    cleanup: null,
    mutates: false,
    selector_target_keys: [],
    api: {
      method: 'POST',
      endpoint: '/api/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'qa@example.test', password: '<valid_password>' },
      expected_status: 200,
      expected_schema: ['access_token', 'user'],
    },
  };
}

function plan(cases, extra = {}) {
  const capabilities = ['ui', 'api'].filter(capability => (
    cases.some(testcase => testcase.capabilities.includes(capability))
  ));
  return {
    schema_version: 1,
    source_manifest: 'login.automation.json',
    source_manifest_sha256: SOURCE_HASH,
    source_marker: `[AUTOMATION_SOURCE:${SOURCE_HASH}]`,
    module: moduleRecord(),
    modules: [moduleRecord()],
    capabilities,
    surface: capabilities.length === 2 ? 'functional' : capabilities[0],
    selection: { selected_count: cases.length, total_count: cases.length },
    testcases: cases,
    ...extra,
  };
}

function evidence() {
  return {
    schema_version: 2,
    feature: 'login',
    status: 'runtime_verified',
    targets: [
      {
        target_key: 'email_input',
        status: 'runtime_verified',
        strategy: 'label',
        locator: "page.getByLabel('Email')",
        verification: { count: 1, visible: true, actionable: true },
      },
      {
        target_key: 'dashboard_heading',
        status: 'runtime_verified',
        strategy: 'role',
        locator: "page.getByRole('heading', { name: 'Dashboard' })",
        verification: { count: 1, visible: true, actionable: false },
      },
    ],
  };
}

function withTempRoot(prefix, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('UI codegen emits one deterministic selector/page/spec set and is idempotent', () => {
  withTempRoot('pom-codegen-ui-', root => {
    const planPath = writeJson(root, 'plans/login.pom-plan.json', plan([uiCase()]));
    const evidencePath = writeJson(root, 'selector-evidence/login.json', evidence());

    const first = generatePomCode({
      planPaths: [planPath],
      selectorEvidencePaths: [evidencePath],
      projectRoot: root,
      surface: 'ui',
    });
    assert.deepEqual(first.changed_artifacts, ['selector', 'page', 'spec']);
    assert.deepEqual(first.artifacts.map(item => item.path), [
      'selectors/login.selectors.ts',
      'pages/login.page.ts',
      'tests/ui/login.ui.spec.ts',
    ]);
    const snapshot = Object.fromEntries(first.artifacts.map(item => [
      item.path,
      fs.readFileSync(path.join(root, item.path), 'utf8'),
    ]));
    const second = generatePomCode({
      planPaths: [planPath],
      selectorEvidencePaths: [evidencePath],
      projectRoot: root,
      surface: 'ui',
    });
    assert.deepEqual(second.changed_artifacts, []);
    assert.equal(second.report_changed, false);
    for (const [relativePath, content] of Object.entries(snapshot)) {
      assert.equal(fs.readFileSync(path.join(root, relativePath), 'utf8'), content);
    }

    const selectors = snapshot['selectors/login.selectors.ts'];
    const page = snapshot['pages/login.page.ts'];
    const spec = snapshot['tests/ui/login.ui.spec.ts'];
    assert.match(selectors, /"email_input"[\s\S]*strategy: "label"[\s\S]*page\.getByLabel\('Email'\)/);
    assert.match(page, /private readonly emailInputTarget: Locator/);
    assert.match(page, /async fillEmailInput\(value: string\)/);
    assert.match(spec, /from '\.\.\/\.\.\/fixtures\/pom'/);
    assert.match(spec, new RegExp(`AUTOMATION_SOURCE:${SOURCE_HASH}`));
    assert.doesNotMatch(spec, /getByLabel|page\.locator|\.first\(\)|\.last\(\)/);

    const manifestPath = writeJson(root, 'login.automation.json', {
      schema_version: 1,
      testcases: [{
        testcase_id: 'LOGIN-UI-01',
        group: 'LOGIN',
        execution: { steps: [{ action: 'fill' }] },
      }],
    });
    const layout = verifyModuleArtifactLayout({
      manifestPath,
      projectRoot: root,
      surface: 'ui',
      planPaths: [planPath],
    });
    assert.equal(layout.status, 'PASS', JSON.stringify(layout.violations));
    assert.equal(layout.scope, 'selected');
  });
});

test('API codegen emits client/schema/spec without UI artifacts', () => {
  withTempRoot('pom-codegen-api-', root => {
    const planPath = writeJson(root, 'plans/login.pom-plan.json', plan([apiCase()]));
    const result = generatePomCode({ planPaths: [planPath], projectRoot: root, surface: 'api' });
    assert.deepEqual(result.artifacts.map(item => item.path), [
      'clients/login.client.ts',
      'schemas/login.schema.ts',
      'tests/api/login.api.spec.ts',
    ]);
    assert.equal(fs.existsSync(path.join(root, 'pages/login.page.ts')), false);
    assert.equal(fs.existsSync(path.join(root, 'selectors/login.selectors.ts')), false);
    const client = fs.readFileSync(path.join(root, 'clients/login.client.ts'), 'utf8');
    const schema = fs.readFileSync(path.join(root, 'schemas/login.schema.ts'), 'utf8');
    const spec = fs.readFileSync(path.join(root, 'tests/api/login.api.spec.ts'), 'utf8');
    assert.match(client, /class LoginClient/);
    assert.match(client, /constructor\(private readonly api: ApiClient\)/);
    assert.match(client, /this\.api\.fetch\("POST", endpoint/);
    assert.match(client, /postApiV1AuthLogin/);
    assert.match(schema, /LoginApi01ResponseSchema/);
    assert.match(schema, /"access_token": z\.unknown\(\)/);
    assert.match(spec, /requiredRuntimeValue\("LOGIN-API-01_body_password"\)/);
    assert.match(spec, /async \(\{ api \}\)/);
    assert.doesNotMatch(spec, /\{ request \}|new LoginClient\(request/);
    assert.match(spec, /expect\(response\.status\(\)\)\.toBe\(200\)/);
    assert.doesNotMatch(spec, /<valid_password>/);
    assert.equal(result.api_operation_inventory.path, 'operation-inventory/login.api-operations.json');
    const coverage = verifyApiOperationCoverage({
      projectRoot: root,
      inventoryPath: result.api_operation_inventory.path,
      testcaseIds: ['LOGIN-API-01'],
    });
    assert.equal(coverage.status, 'PASS', JSON.stringify(coverage.violations, null, 2));
    const second = generatePomCode({ planPaths: [planPath], projectRoot: root, surface: 'api' });
    assert.deepEqual(second.changed_artifacts, []);
    assert.equal(second.report_changed, false);
  });
});

test('functional codegen requires a composed per-testcase UI+API flow and emits all layers', () => {
  withTempRoot('pom-codegen-functional-', root => {
    const functionalCase = {
      ...uiCase('LOGIN-FUNC-01'),
      api: apiCase('LOGIN-FUNC-01').api,
      capabilities: ['ui', 'api'],
      capability_order: ['api', 'ui'],
    };
    const planPath = writeJson(root, 'plans/login.pom-plan.json', plan([functionalCase]));
    const evidencePath = writeJson(root, 'selector-evidence/login.json', evidence());
    const result = generatePomCode({
      planPaths: [planPath],
      selectorEvidencePaths: [evidencePath],
      projectRoot: root,
      surface: 'functional',
    });
    assert.deepEqual(result.artifacts.map(item => item.kind), [
      'selector', 'page', 'client', 'schema', 'spec',
    ]);
    const spec = fs.readFileSync(path.join(root, 'tests/functional/login.functional.spec.ts'), 'utf8');
    assert.match(spec, /async \(\{ page, api \}\)/);
    assert.doesNotMatch(spec, /\brequest\b/);
    assert.ok(spec.indexOf('FUNCTIONAL:API') < spec.indexOf('fillEmailInput'));

    const mixedPath = writeJson(root, 'plans/mixed.pom-plan.json', plan([
      uiCase('LOGIN-UI-02', 0),
      apiCase('LOGIN-API-02', 1),
    ]));
    assert.throws(
      () => loadPomPlans([mixedPath]),
      /FUNCTIONAL_FLOW_NOT_COMPOSED/,
    );
  });
});

test('codegen blocks oversized/multi-module plans, unsafe selectors, and manual target files', () => {
  withTempRoot('pom-codegen-gates-', root => {
    const oversized = plan(Array.from({ length: 21 }, (_, index) => uiCase(`LOGIN-UI-${index + 1}`, index)));
    const oversizedPath = writeJson(root, 'plans/oversized.json', oversized);
    assert.throws(() => loadPomPlans([oversizedPath]), /PLAN_CASE_LIMIT/);

    const multiPath = writeJson(root, 'plans/multi.json', {
      ...plan([uiCase()]),
      module: null,
      modules: [moduleRecord(), { group: 'ORDERS', slug: 'orders' }],
    });
    assert.throws(() => loadPomPlans([multiPath]), /PLAN_REQUIRES_EXACTLY_ONE_MODULE/);

    const validPath = writeJson(root, 'plans/valid.json', plan([uiCase()]));
    const unsafeEvidence = evidence();
    unsafeEvidence.targets[0].locator = "page.getByLabel('Email').first()";
    const unsafePath = writeJson(root, 'selector-evidence/unsafe.json', unsafeEvidence);
    assert.throws(
      () => generatePomCode({
        planPaths: [validPath],
        selectorEvidencePaths: [unsafePath],
        projectRoot: root,
        surface: 'ui',
      }),
      /SELECTOR_LOCATOR_UNSAFE/,
    );

    const evidencePath = writeJson(root, 'selector-evidence/valid.json', evidence());
    fs.mkdirSync(path.join(root, 'selectors'), { recursive: true });
    fs.writeFileSync(path.join(root, 'selectors/login.selectors.ts'), 'export const manual = true;\n');
    assert.throws(
      () => generatePomCode({
        planPaths: [validPath],
        selectorEvidencePaths: [evidencePath],
        projectRoot: root,
        surface: 'ui',
      }),
      /ARTIFACT_NOT_CODEGEN_OWNED/,
    );
  });
});

test('codegen blocks output through a symlink or junction that escapes project root', t => {
  withTempRoot('pom-codegen-symlink-', root => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-codegen-outside-'));
    try {
      const planPath = writeJson(root, 'plans/login.json', plan([uiCase()]));
      const evidencePath = writeJson(root, 'selector-evidence/login.json', evidence());
      try {
        fs.symlinkSync(outside, path.join(root, 'selectors'), process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        t.skip(`Cannot create a test symlink/junction: ${error.code || error.message}`);
        return;
      }
      assert.throws(
        () => generatePomCode({
          planPaths: [planPath],
          selectorEvidencePaths: [evidencePath],
          projectRoot: root,
          surface: 'ui',
        }),
        /OUTPUT_PATH_SYMLINK_ESCAPE/,
      );
      assert.equal(fs.existsSync(path.join(outside, 'login.selectors.ts')), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('codegen-owned files carry the ownership marker', () => {
  assert.match(GENERATED_MARKER, /^\/\/ @generated/);
});
