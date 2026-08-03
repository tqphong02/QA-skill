import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTraceability } from '../assets/templates/scripts/verify-testcase-traceability.mjs';

function writeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-traceability-'));
  fs.mkdirSync(path.join(root, 'tests', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(root, 'selectors'), { recursive: true });
  fs.mkdirSync(path.join(root, 'selector-evidence'), { recursive: true });

  const testcasePath = path.join(root, 'login.md');
  fs.writeFileSync(testcasePath, `##### [TC_LOGIN_01] — Login thành công

| Step | Action | Target key | Target |
|---|---|---|---|
| S01 | fill | email_input | Email |
| S02 | click | login_submit | Đăng nhập |
`, 'utf8');
  fs.writeFileSync(path.join(root, 'tests', 'ui', 'login.ui.spec.ts'), `
import { test } from '@playwright/test';
test('TC_LOGIN_01 [happy] — Login thành công @ui', async () => {});
`, 'utf8');
  fs.writeFileSync(path.join(root, 'selectors', 'login.selectors.ts'), `
export const loginSelectors = {
  email: (page) => page.getByLabel('Email'),
  submit: (page) => page.getByRole('button', { name: 'Đăng nhập' }),
} as const;
`, 'utf8');
  fs.writeFileSync(path.join(root, 'selector-evidence', 'login.json'), JSON.stringify({
    schema_version: 1,
    feature: 'login',
    targets: [
      {
        target_key: 'email_input',
        status: 'runtime_verified',
        strategy: 'label',
        locator: "page.getByLabel('Email')",
        route: '/login',
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
        route: '/login',
        candidates: [
          { strategy: 'testid', available: false, reason: 'No FE-owned test-id' },
          { strategy: 'id', available: false },
          { strategy: 'css', available: false },
          { strategy: 'role', available: true, count: 1 },
        ],
        verification: { count: 1, visible: true, actionable: true, url: '/login' },
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

  return { root, testcasePath, tokenUsagePath };
}

test('traceability audit links testcase IDs, target keys, selectors and provider usage', () => {
  const fixture = writeFixture();
  try {
    const report = buildTraceability({
      testcasePath: fixture.testcasePath,
      automationRoot: fixture.root,
      evidenceDir: path.join(fixture.root, 'selector-evidence'),
      tokenUsagePath: fixture.tokenUsagePath,
      mode: 'ui',
    });

    assert.equal(report.status, 'PASS');
    assert.deepEqual(report.source.testcase_ids, ['TC_LOGIN_01']);
    assert.equal(report.source.sha256, crypto.createHash('sha256')
      .update(fs.readFileSync(fixture.testcasePath)).digest('hex'));
    assert.equal(report.summary.testcase_mapped_count, 1);
    assert.equal(report.summary.target_key_runtime_verified_count, 2);
    assert.equal(report.token_usage.measurement, 'provider_reported');
    assert.equal(report.token_usage.total_tokens, 123);
    assert.deepEqual(report.automation.selector_priority, [
      'testid', 'id', 'css', 'role', 'label', 'placeholder', 'text', 'xpath',
    ]);
    assert.equal(report.selector_coverage[0].candidates[0].strategy, 'testid');
    assert.deepEqual(
      report.selector_coverage.map(item => item.target_key),
      ['email_input', 'login_submit'],
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('traceability audit blocks a lower-priority locator when a higher-priority candidate is available', () => {
  const fixture = writeFixture();
  try {
    const evidencePath = path.join(fixture.root, 'selector-evidence', 'login.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    evidence.targets[0].candidates[0] = {
      strategy: 'testid',
      available: true,
      source: 'FE contract',
      count: 1,
    };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');

    const report = buildTraceability({
      testcasePath: fixture.testcasePath,
      automationRoot: fixture.root,
      evidenceDir: path.join(fixture.root, 'selector-evidence'),
      tokenUsagePath: fixture.tokenUsagePath,
      mode: 'ui',
    });

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
    const report = buildTraceability({
      testcasePath: fixture.testcasePath,
      automationRoot: fixture.root,
      evidenceDir: path.join(fixture.root, 'selector-evidence'),
      mode: 'ui',
    });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(violation => violation.code === 'SELECTOR_EVIDENCE_MISSING'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
