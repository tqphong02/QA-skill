import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectRuntimeScaffold } from '../assets/templates/scripts/verify-runtime-scaffold.mjs';

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function scaffoldRoot(specImport) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-runtime-scaffold-'));
  write(root, 'fixtures/pom.ts', `
export const test = {};
export const expect = {};
captureCanonicalUiEvidence;
const fixtures = { api: {}, authenticatedApi: {}, testData: {}, workerAccount: {} };
`);
  write(root, 'fixtures/api-client.ts', 'export class ApiClient {}\n');
  write(root, 'fixtures/auth.ts', 'export const auth = {};\n');
  write(root, 'fixtures/data-driven.ts', 'export const data = {};\n');
  write(root, 'fixtures/runtime-context.ts', 'export const runtime = {};\n');
  write(root, 'fixtures/allure-contract.ts', 'export const canonical = true;\n');
  write(root, 'fixtures/parallel-pool.js', 'exports.poolCapacity = () => 1;\n');
  write(root, 'fixtures/parallel-pool.d.ts', 'export function poolCapacity(): number;\n');
  write(root, 'scripts/artifact-naming.mjs', 'export const resolveModuleSlug = value => value;\n');
  write(root, 'scripts/generate-pom-code.mjs', 'export const generatePomCode = () => ({});\n');
  write(root, 'scripts/execution-lock.mjs', 'export const acquireExecutionLock = () => ({ release() {} });\n');
  write(root, 'scripts/verify-module-artifact-layout.mjs', 'export const inspectModuleArtifactLayout = () => ({ status: "PASS" });\n');
  write(root, 'scripts/verify-api-operation-coverage.mjs', 'export const verifyApiOperationCoverage = () => ({ status: "PASS" });\n');
  write(root, 'scripts/verify-allure-contract.mjs', 'export const verifyAllureContract = () => ({ status: "PASS" });\n');
  write(root, 'scripts/qa.mjs', 'export const main = () => 0;\n');
  write(root, 'scripts/merge-allure-results.mjs', 'export const mergeAllureResults = () => ({ status: "PASS" });\n');
  write(root, 'playwright.config.ts', `
const unifiedEvidence = process.env.QA_UNIFIED_EVIDENCE !== 'false';
const workers = process.env.PW_WORKERS || 1;
export default {
  workers,
  outputDir: 'evidence/test-results',
  reporter: [
    ['json', { outputFile: 'reports/playwright.json' }],
    ['allure-playwright', { resultsDir: 'reports/allure-results', detail: true, suiteTitle: false }],
  ],
  use: { trace: unifiedEvidence ? 'on' : 'retain-on-failure', screenshot: 'off', video: 'on' },
};
`);
  write(root, 'tests/functional/example.functional.spec.ts', `
${specImport}
// [AUTOMATION_SOURCE:fixture]
test('TC-001 | generated', async () => {});
`);
  return root;
}

test('runtime scaffold accepts generated specs wired through fixtures/pom', () => {
  const root = scaffoldRoot("import { expect, test } from '../../fixtures/pom';");
  try {
    const result = inspectRuntimeScaffold(root);
    assert.equal(result.status, 'PASS');
    assert.equal(result.generated_spec_count, 1);
    assert.deepEqual(result.violations, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime scaffold blocks generated specs that bypass the POM fixture', () => {
  const root = scaffoldRoot("import { expect, test } from '@playwright/test';");
  try {
    const result = inspectRuntimeScaffold(root);
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'GENERATED_SPEC_BYPASSES_POM_FIXTURE'));
    assert.ok(result.violations.some(item => item.code === 'GENERATED_SPEC_POM_FIXTURE_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime scaffold blocks generated specs that destructure raw request', () => {
  const root = scaffoldRoot("import { expect, test } from '../../fixtures/pom';");
  try {
    write(root, 'tests/functional/example.functional.spec.ts', `
import { expect, test } from '../../fixtures/pom';
// [AUTOMATION_SOURCE:fixture]
test('TC-001 | generated', async ({ request }) => { await request.get('/unsafe'); });
`);
    const result = inspectRuntimeScaffold(root);
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'GENERATED_SPEC_BYPASSES_API_FIXTURE'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime scaffold blocks missing evidence output policy', () => {
  const root = scaffoldRoot("import { expect, test } from '../../fixtures/pom';");
  try {
    write(root, 'playwright.config.ts', 'export default { use: {} };\n');
    const result = inspectRuntimeScaffold(root);
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.violations.some(item => item.code === 'EVIDENCE_OUTPUT_MISSING'));
    assert.ok(result.violations.some(item => item.code === 'DYNAMIC_WORKERS_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
