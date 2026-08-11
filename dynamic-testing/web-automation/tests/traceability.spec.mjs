import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildTraceability,
  parseAutomationManifest,
  parseTestcases,
  readTokenUsage,
} from '../assets/templates/scripts/verify-testcase-traceability.mjs';

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-traceability-'));
  fs.mkdirSync(path.join(root, 'tests', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(root, 'selectors'), { recursive: true });
  fs.mkdirSync(path.join(root, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'selector-evidence'), { recursive: true });

  const testcasePath = path.join(root, 'login.md');
  fs.writeFileSync(testcasePath, `##### [TC_LOGIN_01] — Login thành công

| Step | Action | Target key | Target |
|---|---|---|---|
| S01 | fill | email_input | Email |
| S02 | click | login_submit | Đăng nhập |
`, 'utf8');
  fs.writeFileSync(path.join(root, 'pages', 'login.page.ts'), `
export class LoginPage {
  async fillEmailInput(value: string) { await this.email.fill(value); }
  async clickLoginSubmit() { await this.submit.click(); }
}
`, 'utf8');

  const manifestPath = path.join(root, 'login.automation.json');
  const manifest = {
    schema_version: 1,
    source: {
      project_code: 'TC',
      markdown_file: 'login.md',
      markdown_sha256: fileSha256(testcasePath),
      testcase_count: 1,
    },
    rbac: {
      version: 1,
      roles: [{ key: 'employee', name: 'Nhân viên' }],
      rules: [],
    },
    testcases: [{
      testcase_id: 'TC_LOGIN_01',
      testcase_id_display: '[TC_LOGIN_01]',
      case_ref: 'LOGIN_EMPLOYEE_SUCCESS',
      section_kind: 'function',
      group: 'LOGIN',
      scenario_id: 'SCN-LOGIN-001',
      scenario_name: 'Đăng nhập',
      type: 'happy',
      requirement: 'AC-LOGIN-01',
      priority: 'High',
      description: 'Đăng nhập thành công',
      api: null,
      execution: {
        version: 1,
        mutates: false,
        entry: {
          environment: 'UAT',
          screen: 'Đăng nhập',
          route: '/login',
          role: 'Nhân viên',
          role_key: 'employee',
          rbac_refs: ['RBAC-LOGIN-001'],
          state: ['Chưa đăng nhập'],
          permissions: ['Được phép đăng nhập'],
          data: [{ name: 'Email', value: 'qa@example.com' }],
        },
        steps: [
          {
            id: 'S01',
            action: 'fill',
            target: { key: 'email_input', kind: 'field', name: 'Email' },
            value: 'qa@example.com',
            assertions: [{ kind: 'value', target: 'email_input', value: 'qa@example.com' }],
          },
          {
            id: 'S02',
            action: 'click',
            target: { key: 'login_submit', kind: 'button', name: 'Đăng nhập' },
            assertions: [],
          },
        ],
        outcome: {
          route: '/dashboard',
          assertions: [{ kind: 'visible', target: 'dashboard_heading', text: 'Dashboard hiển thị' }],
        },
      },
    }],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const manifestHash = fileSha256(manifestPath);
  const contract = parseAutomationManifest(manifestPath).cases[0];
  const [stepOne, stepTwo] = contract.required_markers.steps;
  const stepOneAssertion = contract.required_markers.step_assertions[0][0];
  const outcome = contract.required_markers.outcomes[0];

  fs.writeFileSync(path.join(root, 'tests', 'ui', 'login.ui.spec.ts'), `
import { test, expect } from '@playwright/test';
const source = '[AUTOMATION_SOURCE:${manifestHash}]';
test('TC_LOGIN_01 [happy] — Login thành công @ui', async () => {
  test.info().annotations.push({ type: 'contract', description: '[TC_LOGIN_01:ROLE] employee' });
  test.info().annotations.push({ type: 'contract', description: '[TC_LOGIN_01:RBAC] RBAC-LOGIN-001' });
  await test.step('${stepOne}', async () => { await loginPage.fillEmailInput('qa@example.com'); });
  await test.step('${stepOneAssertion}', async () => { await expect(loginPage.emailInput).toHaveValue('qa@example.com'); });
  await test.step('${stepTwo}', async () => { await loginPage.clickLoginSubmit(); });
  await test.step('${outcome}', async () => { await expect(loginPage.dashboardHeading).toBeVisible(); });
});
`, 'utf8');
  fs.writeFileSync(path.join(root, 'selectors', 'login.selectors.ts'), `
export const loginSelectors = {
  email: (page) => page.getByLabel('Email'),
  submit: (page) => page.getByRole('button', { name: 'Đăng nhập' }),
  dashboard: (page) => page.getByRole('heading', { name: 'Dashboard' }),
} as const;
`, 'utf8');
  fs.writeFileSync(path.join(root, 'selector-evidence', 'login.json'), JSON.stringify({
    schema_version: 1,
    feature: 'login',
    route: '/login',
    role: 'employee',
    captured_at: new Date().toISOString(),
    run_id: 'selector-run-001',
    app_build: 'build-001',
    targets: [
      {
        target_key: 'email_input',
        status: 'runtime_verified',
        strategy: 'label',
        locator: "page.getByLabel('Email')",
        candidates: [
          { strategy: 'testid', available: false, reason: 'No FE-owned test-id' },
          { strategy: 'id', available: false },
          { strategy: 'css', available: false },
          { strategy: 'role', available: false },
          { strategy: 'label', available: true, count: 1 },
        ],
        verification: { count: 1, visible: true, actionable: true, url: '/login' },
      },
      {
        target_key: 'login_submit',
        status: 'runtime_verified',
        strategy: 'role',
        locator: "page.getByRole('button', { name: 'Đăng nhập' })",
        candidates: [
          { strategy: 'testid', available: false, reason: 'No FE-owned test-id' },
          { strategy: 'id', available: false },
          { strategy: 'css', available: false },
          { strategy: 'role', available: true, count: 1 },
        ],
        verification: { count: 1, visible: true, actionable: true, url: '/login' },
      },
      {
        target_key: 'dashboard_heading',
        status: 'runtime_verified',
        strategy: 'role',
        locator: "page.getByRole('heading', { name: 'Dashboard' })",
        candidates: [
          { strategy: 'testid', available: false, reason: 'No FE-owned test-id' },
          { strategy: 'id', available: false },
          { strategy: 'css', available: false },
          { strategy: 'role', available: true, count: 1 },
        ],
        verification: { count: 1, visible: true, actionable: false, url: '/dashboard' },
        route: '/dashboard'
      },
    ],
  }, null, 2), 'utf8');
  const tokenUsagePath = path.join(root, 'model-usage.json');
  fs.writeFileSync(tokenUsagePath, JSON.stringify({
    provider: 'test-host',
    model: 'test-model',
    input_tokens: 100,
    output_tokens: 23,
    total_tokens: 123,
  }), 'utf8');

  return { root, testcasePath, manifestPath, tokenUsagePath };
}

function audit(fixture) {
  return buildTraceability({
    testcasePath: fixture.testcasePath,
    manifestPath: fixture.manifestPath,
    automationRoot: fixture.root,
    evidenceDir: path.join(fixture.root, 'selector-evidence'),
    tokenUsagePath: fixture.tokenUsagePath,
    mode: 'ui',
  });
}

test('traceability audit links lossless manifest, behavior markers, RBAC and selectors', () => {
  const fixture = writeFixture();
  try {
    const report = audit(fixture);
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.source.testcase_ids, ['TC_LOGIN_01']);
    assert.equal(report.source.automation_manifest_sha256, fileSha256(fixture.manifestPath));
    assert.equal(report.summary.testcase_mapped_count, 1);
    assert.equal(report.summary.target_key_runtime_verified_count, 3);
    assert.equal(report.token_usage.measurement, 'provider_reported');
    assert.equal(report.token_usage.total_tokens, 123);
    assert.deepEqual(report.cases[0].rbac_refs, ['RBAC-LOGIN-001']);
    assert.ok(report.cases[0].implementation_markers.every(item => item.present));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks an empty spec even when testcase ID exists', () => {
  const fixture = writeFixture();
  try {
    const hash = fileSha256(fixture.manifestPath);
    fs.writeFileSync(path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts'), `
import { test } from '@playwright/test';
const source = '[AUTOMATION_SOURCE:${hash}]';
test('TC_LOGIN_01 @ui', async () => {});
`, 'utf8');
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'EMPTY_TEST_IMPLEMENTATION'));
    assert.ok(report.violations.some(violation => violation.code === 'IMPLEMENTATION_MARKER_MISSING'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks mapped steps whose bodies contain no POM action or assertion', () => {
  const fixture = writeFixture();
  try {
    const specPath = path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts');
    const hollow = fs.readFileSync(specPath, 'utf8')
      .replace("await loginPage.fillEmailInput('qa@example.com');", 'void source;')
      .replace("await expect(loginPage.emailInput).toHaveValue('qa@example.com');", 'void source;')
      .replace('await loginPage.clickLoginSubmit();', 'void source;')
      .replace('await expect(loginPage.dashboardHeading).toBeVisible();', 'void source;');
    fs.writeFileSync(specPath, hollow, 'utf8');
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.violations.filter(violation => (
      violation.code === 'IMPLEMENTATION_ACTION_MISMATCH'
      || violation.code === 'IMPLEMENTATION_ASSERTION_MISMATCH'
    )).length, 4);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a generic click implementation for a fill contract', () => {
  const fixture = writeFixture();
  try {
    const specPath = path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts');
    const wrong = fs.readFileSync(specPath, 'utf8')
      .replace("loginPage.fillEmailInput('qa@example.com')", "loginPage.performStep('S01')");
    fs.writeFileSync(specPath, wrong, 'utf8');
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => (
      violation.code === 'IMPLEMENTATION_ACTION_MISMATCH'
      && violation.required_method === 'fillEmailInput'
    )));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a correctly named Page Object method with the wrong primitive', () => {
  const fixture = writeFixture();
  try {
    const pagePath = path.join(fixture.root, 'pages', 'login.page.ts');
    const wrong = fs.readFileSync(pagePath, 'utf8')
      .replace('this.email.fill(value)', 'this.email.click()');
    fs.writeFileSync(pagePath, wrong, 'utf8');
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => (
      violation.code === 'PAGE_METHOD_ACTION_MISMATCH'
      && violation.required_method === 'fillEmailInput'
    )));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks stale or wrong-build selector evidence', () => {
  const fixture = writeFixture();
  try {
    const evidencePath = path.join(fixture.root, 'selector-evidence', 'login.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    evidence.captured_at = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    const report = buildTraceability({
      testcasePath: fixture.testcasePath,
      manifestPath: fixture.manifestPath,
      automationRoot: fixture.root,
      evidenceDir: path.join(fixture.root, 'selector-evidence'),
      tokenUsagePath: fixture.tokenUsagePath,
      expectedAppBuild: 'build-002',
      maxEvidenceAgeHours: 24,
      mode: 'ui',
    });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'SELECTOR_EVIDENCE_STALE'));
    assert.ok(report.violations.some(violation => violation.code === 'SELECTOR_APP_BUILD_MISMATCH'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a stale automation source marker', () => {
  const fixture = writeFixture();
  try {
    const specPath = path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts');
    fs.writeFileSync(specPath, fs.readFileSync(specPath, 'utf8').replace(
      `[AUTOMATION_SOURCE:${fileSha256(fixture.manifestPath)}]`,
      '[AUTOMATION_SOURCE:stale-hash]',
    ));
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'AUTOMATION_SOURCE_HASH_MISSING'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a missing RBAC marker', () => {
  const fixture = writeFixture();
  try {
    const specPath = path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts');
    fs.writeFileSync(specPath, fs.readFileSync(specPath, 'utf8').replace('[TC_LOGIN_01:RBAC] RBAC-LOGIN-001', 'missing-rbac-marker'));
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.marker === '[TC_LOGIN_01:RBAC] RBAC-LOGIN-001'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a lower-priority locator when a higher-priority candidate is available', () => {
  const fixture = writeFixture();
  try {
    const evidencePath = path.join(fixture.root, 'selector-evidence', 'login.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    evidence.targets[0].candidates[0] = { strategy: 'testid', available: true, source: 'FE contract', count: 1 };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'SELECTOR_PRIORITY_MISMATCH'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks missing runtime selector evidence', () => {
  const fixture = writeFixture();
  try {
    fs.rmSync(path.join(fixture.root, 'selector-evidence'), { recursive: true, force: true });
    const report = audit(fixture);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'SELECTOR_EVIDENCE_MISSING'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit accepts visible=false evidence for a hidden assertion', () => {
  const fixture = writeFixture();
  try {
    const oldHash = fileSha256(fixture.manifestPath);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.testcases[0].execution.outcome.assertions[0].kind = 'hidden';
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const newHash = fileSha256(fixture.manifestPath);

    const specPath = path.join(fixture.root, 'tests', 'ui', 'login.ui.spec.ts');
    const spec = fs.readFileSync(specPath, 'utf8')
      .replace(`[AUTOMATION_SOURCE:${oldHash}]`, `[AUTOMATION_SOURCE:${newHash}]`)
      .replace('[TC_LOGIN_01:OUTCOME:01] visible dashboard_heading', '[TC_LOGIN_01:OUTCOME:01] hidden dashboard_heading')
      .replace('toBeVisible()', 'toBeHidden()');
    fs.writeFileSync(specPath, spec, 'utf8');

    const evidencePath = path.join(fixture.root, 'selector-evidence', 'login.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    evidence.targets[2].verification.visible = false;
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');

    const report = audit(fixture);
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
    assert.equal(report.cases[0].implementation_markers.every(item => item.present), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Markdown parser accepts generated UI testcase IDs', () => {
  const parsed = parseTestcases(`##### [DEMO-UI-01] — UI case

| Step | Action | Target key | Target |
|---|---|---|---|
| S01 | click | save_button | Save |
`);
  assert.deepEqual(parsed.cases.map(item => item.id), ['DEMO-UI-01']);
});

test('token telemetry aggregates named generation stages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-token-usage-'));
  try {
    const usagePath = path.join(root, 'usage.json');
    fs.writeFileSync(usagePath, JSON.stringify({
      provider: 'test-host',
      model: 'test-model',
      stages: {
        testcase_generation: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        pom_generation: { input_tokens: 40, output_tokens: 5, total_tokens: 45 },
      },
    }), 'utf8');
    const usage = readTokenUsage(usagePath);
    assert.equal(usage.measurement, 'provider_reported');
    assert.equal(usage.total_tokens, 75);
    assert.equal(usage.stages.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
