import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(TEST_ROOT, '../assets/templates');

function source(relativePath) {
  return fs.readFileSync(path.join(TEMPLATE_ROOT, relativePath), 'utf8');
}

test('fixtures/pom is the only public generated-spec fixture entrypoint', () => {
  const pom = source('fixtures/pom.ts');
  const auth = source('fixtures/auth.ts');
  const dataDriven = source('fixtures/data-driven.ts');

  assert.match(pom, /export const test = base\.extend<PomFixtures>/);
  for (const fixture of ['pomRuntime', 'authenticatedApi', 'workerAccount', 'testData']) {
    assert.match(pom, new RegExp('\\b' + fixture + '\\b'));
  }
  assert.doesNotMatch(auth, /export const test\b|test as base|\.extend</);
  assert.doesNotMatch(dataDriven, /export const test\b|test as base|\.extend</);
  assert.match(dataDriven, /export function createTestData/);
  assert.match(dataDriven, /build<T extends Record<string, unknown>>\(defaults: T, overrides\?: Partial<T>\): T/);
  assert.match(dataDriven, /return \{ \.\.\.defaults, \.\.\.overrides \};/);
  assert.match(auth, /export function resolveWorkerAccount/);
});

test('one canonical fixture owns Allure and page evidence for every surface', () => {
  const pom = source('fixtures/pom.ts');
  const auth = source('fixtures/auth.ts');
  const dataDriven = source('fixtures/data-driven.ts');

  assert.match(pom, /canonicalAllure:/);
  assert.match(pom, /captureCanonicalUiEvidence/);
  assert.match(pom, /type: 'qa-api-request'/);
  assert.doesNotMatch(auth, /captureCanonicalUiEvidence|addCanonicalAllureParameters|allure-playwright/);
  assert.doesNotMatch(dataDriven, /captureCanonicalUiEvidence|addCanonicalAllureParameters|allure-playwright/);
});

test('UI, API and functional examples all consume fixtures/pom and carry testcase IDs', () => {
  const examples = [
    'tests/ui/example.ui.spec.ts',
    'tests/ui/example.data-driven.ui.spec.ts',
    'tests/api/example.api.spec.ts',
    'tests/functional/example.functional.spec.ts',
  ];
  for (const relativePath of examples) {
    const contents = source(relativePath);
    assert.match(contents, /from ['"]\.\.\/\.\.\/fixtures\/pom['"]/);
    assert.doesNotMatch(contents, /fixtures\/(?:auth|data-driven)['"]/);
    assert.match(contents, /test\((?:['"][A-Za-z0-9][A-Za-z0-9_.-]+|`\$\{data\.id\})/);
  }
});

test('ApiClient exposes only redacted last-request metadata to the fixture owner', () => {
  const apiClient = source('fixtures/api-client.ts');
  const record = apiClient.match(/export type ApiRequestRecord = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? '';
  assert.match(apiClient, /lastRequest\(\): ApiRequestRecord \| null/);
  assert.match(apiClient, /fetch\(method: ApiMethod, requestPath: string, options: ApiFetchOptions/);
  assert.match(record, /method: ApiMethod;\s*path: string;\s*url: string;/s);
  assert.doesNotMatch(record, /(?:headers|body|token):/);
});

test('ApiClient method contract covers every HTTP operation accepted by codegen', () => {
  const contents = source('fixtures/api-client.ts');
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.match(contents, new RegExp(`['"]${method}['"]`));
  }
});
