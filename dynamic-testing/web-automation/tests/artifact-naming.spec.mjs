import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  moduleArtifactNames,
  moduleArtifactPaths,
  resolveModuleSlug,
} from '../assets/templates/scripts/artifact-naming.mjs';
import { buildPomPlan, defaultPomPlanPath } from '../assets/templates/scripts/generate-pom-plan.mjs';
import { verifyModuleArtifactLayout } from '../assets/templates/scripts/verify-module-artifact-layout.mjs';

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function manifest(testcases) {
  return JSON.stringify({ schema_version: 1, testcases }, null, 2);
}

test('module slugs and artifact names are deterministic and source-safe', () => {
  assert.equal(
    resolveModuleSlug('Quản lý đơn hàng & Đổi trả'),
    'quan-ly-don-hang-and-doi-tra',
  );
  assert.equal(resolveModuleSlug('2FA / Login'), 'module-2fa-login');
  assert.equal(resolveModuleSlug(''), 'other');
  const orderSlug = resolveModuleSlug('Quản lý đơn hàng');
  assert.deepEqual(moduleArtifactNames(orderSlug, 'ui'), {
    slug: 'quan-ly-don-hang',
    selector: 'quan-ly-don-hang.selectors.ts',
    page: 'quan-ly-don-hang.page.ts',
    spec: 'quan-ly-don-hang.ui.spec.ts',
  });
  assert.equal(
    path.relative(process.cwd(), defaultPomPlanPath('testcases/orders.automation.json', 'Quản lý đơn hàng')),
    path.join('plans', 'quan-ly-don-hang.pom-plan.json'),
  );
});

test('module layout maps one group to one final artifact set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-artifact-layout-'));
  try {
    const manifestPath = path.join(root, 'testcases.automation.json');
    write(root, 'testcases.automation.json', manifest([
      { group: 'Quản lý đơn hàng', testcase_id: 'TC_ORDER_01' },
    ]));
    const plan = buildPomPlan(manifestPath, { group: 'QUẢN LÝ ĐƠN HÀNG' });
    assert.deepEqual(plan.module, {
      group: 'Quản lý đơn hàng',
      slug: 'quan-ly-don-hang',
    });
    const expected = moduleArtifactPaths(root, resolveModuleSlug('Quản lý đơn hàng'), 'ui');
    write(root, path.relative(root, expected.page), 'export class OrdersPage {}\n');
    write(root, path.relative(root, expected.selector), 'export const orderSelectors = {};\n');
    write(root, path.relative(root, expected.spec), "test('TC_ORDER_01 | happy', () => {});\n");

    const result = verifyModuleArtifactLayout({
      manifestPath,
      projectRoot: root,
      surface: 'ui',
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.artifacts[0].slug, 'quan-ly-don-hang');
    assert.equal(result.artifacts[0].names.spec, 'quan-ly-don-hang.ui.spec.ts');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('module layout blocks slug collisions and reserved scaffold names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-artifact-collision-'));
  try {
    const manifestPath = path.join(root, 'testcases.automation.json');
    write(root, 'testcases.automation.json', manifest([
      { group: 'Đăng nhập', testcase_id: 'TC_LOGIN_01' },
      { group: 'dang nhap', testcase_id: 'TC_LOGIN_02' },
      { group: 'base', testcase_id: 'TC_BASE_01' },
    ]));

    assert.throws(
      () => buildPomPlan(manifestPath),
      /MODULE_SLUG_COLLISION/,
    );

    const result = verifyModuleArtifactLayout({
      manifestPath,
      projectRoot: root,
      surface: 'functional',
    });

    assert.equal(result.status, 'FAILED');
    assert.ok(result.violations.some(item => item.code === 'MODULE_SLUG_COLLISION'));
    assert.ok(result.violations.some(item => item.code === 'MODULE_SLUG_RESERVED'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('POM planning hard-blocks more than 20 cases even through the public function', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-plan-limit-'));
  try {
    const manifestPath = path.join(root, 'testcases.automation.json');
    write(root, 'testcases.automation.json', manifest(Array.from({ length: 21 }, (_, index) => ({
      group: 'LOGIN',
      testcase_id: `TC_LOGIN_${String(index + 1).padStart(2, '0')}`,
    }))));
    assert.throws(() => buildPomPlan(manifestPath), /hard limit 20/);
    assert.throws(() => buildPomPlan(manifestPath, { maxCases: 21 }), /integer from 1 to 20/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime data is fixture-owned and distinct from committed case data', () => {
  const templateRoot = path.resolve('dynamic-testing/web-automation/assets/templates');
  const gitignore = fs.readFileSync(path.join(templateRoot, '.gitignore'), 'utf8');
  const dataFixture = fs.readFileSync(path.join(templateRoot, 'fixtures/data-driven.ts'), 'utf8');

  assert.match(gitignore, /runtime-data\//);
  assert.doesNotMatch(gitignore, /(^|\n)testdata\//);
  assert.match(dataFixture, /export function createTestData/);
  assert.doesNotMatch(dataFixture, /writeFileSync|TestDataStore/);
  assert.equal(fs.existsSync(path.join(templateRoot, 'fixtures/test-data.ts')), false);
  assert.ok(fs.existsSync(path.join(templateRoot, 'test-data/cases/login.cases.ts')));
});
