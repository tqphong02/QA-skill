import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertParallelPool,
  assertPoolCapacity,
  configuredPool,
  packageProjectKey,
  poolCapacity,
  selectPoolSlots,
} from '../assets/templates/fixtures/parallel-pool.js';
import { acquireExecutionLock } from '../assets/templates/scripts/execution-lock.mjs';

const TEMPLATE_ROOT = path.resolve('dynamic-testing/web-automation/assets/templates');

test('pool resolution prefers project-specific, then QA, then generic non-empty values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-pool-project-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@shop/web-qa' }));
    const projectKey = packageProjectKey(root, {});
    assert.equal(projectKey, 'SHOP_WEB_QA');

    const environment = {
      SHOP_WEB_QA_TEST_ACCOUNTS_JSON: '  ',
      QA_TEST_ACCOUNTS_JSON: '[{"id":"qa"}]',
      TEST_ACCOUNTS_JSON: '[{"id":"generic"}]',
    };
    assert.deepEqual(configuredPool('ACCOUNTS', projectKey, environment), {
      name: 'QA_TEST_ACCOUNTS_JSON',
      raw: '[{"id":"qa"}]',
    });

    environment.SHOP_WEB_QA_TEST_ACCOUNTS_JSON = '[{"id":"project"}]';
    assert.equal(
      configuredPool('ACCOUNTS', projectKey, environment)?.name,
      'SHOP_WEB_QA_TEST_ACCOUNTS_JSON',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('role-tagged pool capacity uses the smallest isolated role pool', () => {
  const raw = JSON.stringify([
    { id: 'owner-0', role: 'owner' },
    { id: 'owner-1', role: 'owner' },
    { id: 'guest-0', role: 'guest' },
  ]);
  assert.equal(poolCapacity(raw, 'ACCOUNTS'), 1);
  assert.deepEqual(
    selectPoolSlots(raw, 'QA_TEST_ACCOUNTS_JSON', 'owner', true).map(slot => slot.id),
    ['owner-0', 'owner-1'],
  );
});

test('pool parser rejects ambiguous mixed role metadata', () => {
  const raw = JSON.stringify([
    { id: 'owner-0', role: 'owner' },
    { id: 'untagged' },
  ]);
  assert.equal(poolCapacity(raw, 'ACCOUNTS'), 0);
  assert.throws(
    () => selectPoolSlots(raw, 'QA_TEST_ACCOUNTS_JSON', 'owner', true),
    /cannot mix role-tagged and untagged slots/,
  );
});

test('duplicate dataset contents cannot be disguised by different slot IDs', () => {
  const raw = JSON.stringify([
    { id: 'data-0', dataRoot: 'runtime-data/shared', values: { tenant: 'same' } },
    { id: 'data-1', dataRoot: 'runtime-data/shared', values: { tenant: 'same' } },
  ]);
  assert.equal(poolCapacity(raw, 'DATASETS'), 1);
  assert.throws(
    () => assertParallelPool(raw, 2, 'QA_TEST_DATASETS_JSON', 'DATASETS'),
    /safe parallel capacity 1/,
  );
});

test('account identity rejects the same login across parallel slots', () => {
  const slots = [
    { id: 'account-0', email: 'qa@example.test', password: 'one' },
    { id: 'account-1', email: 'QA@example.test', password: 'two' },
  ];
  assert.throws(
    () => assertPoolCapacity(slots, 2, 'TEST_ACCOUNTS_JSON', 'ACCOUNTS'),
    /reuses an account slot/,
  );
});

test('account identity also rejects one storage state reused by different logins', () => {
  const slots = [
    { email: 'qa-0@example.test', storageState: 'sessions/shared.json' },
    { email: 'qa-1@example.test', storageState: './sessions/shared.json' },
  ];
  assert.throws(
    () => assertPoolCapacity(slots, 2, 'QA_TEST_ACCOUNTS_JSON', 'ACCOUNTS'),
    /reuses an account slot/,
  );
});

test('a slot reused at different indexes across role maps forces single-worker capacity', () => {
  const raw = JSON.stringify({
    owner: [{ storageState: 'sessions/shared.json' }, { storageState: 'sessions/owner-1.json' }],
    guest: [{ storageState: 'sessions/guest-0.json' }, { storageState: 'sessions/shared.json' }],
  });
  assert.equal(poolCapacity(raw, 'ACCOUNTS'), 1);
  assert.throws(
    () => assertParallelPool(raw, 2, 'QA_TEST_ACCOUNTS_JSON', 'ACCOUNTS'),
    /safe parallel capacity 1/,
  );
});

test('the same multi-role account is safe when every role keeps its parallel index', () => {
  const raw = JSON.stringify({
    owner: [{ storageState: 'sessions/shared-0.json' }, { storageState: 'sessions/shared-1.json' }],
    guest: [{ storageState: 'sessions/shared-0.json' }, { storageState: 'sessions/shared-1.json' }],
  });
  assert.equal(poolCapacity(raw, 'ACCOUNTS'), 2);
  assert.doesNotThrow(
    () => assertParallelPool(raw, 2, 'QA_TEST_ACCOUNTS_JSON', 'ACCOUNTS'),
  );
});

test('execution lock blocks two runners from owning fixed report paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-execution-lock-'));
  const first = acquireExecutionLock(root, { runId: 'run-a', operation: 'test' });
  try {
    assert.throws(
      () => acquireExecutionLock(root, { runId: 'run-b', operation: 'test' }),
      /another Playwright execution owns this project output directory/,
    );
  } finally {
    first.release();
  }

  const next = acquireExecutionLock(root, { runId: 'run-c', operation: 'test' });
  next.release();
  fs.rmSync(root, { recursive: true, force: true });
});

test('session template namespaces files by run and worker', () => {
  const source = fs.readFileSync(path.join(TEMPLATE_ROOT, 'fixtures/session.ts'), 'utf8');
  assert.match(source, /defaultSessionNamespace/);
  assert.match(source, /TEST_PARALLEL_INDEX/);
  assert.match(source, /TEST_WORKER_INDEX/);
  assert.match(source, /`\$\{safeFileSegment\(name\)\}\.\$\{safeFileSegment\(namespace\)\}\.json`/);
  assert.doesNotMatch(source, /path\.join\(SESSIONS_DIR, `\$\{name\}\.json`\)/);
});

test('public QA and deterministic testcase runners own the report lock', () => {
  const qa = fs.readFileSync(path.join(TEMPLATE_ROOT, 'scripts/qa.mjs'), 'utf8');
  const testcaseRunner = fs.readFileSync(
    path.join(TEMPLATE_ROOT, 'scripts/run-testcase-pom.mjs'),
    'utf8',
  );
  assert.match(qa, /withPlaywrightLock/);
  assert.match(qa, /acquireExecutionLock\(process\.cwd\(\)/);
  assert.match(testcaseRunner, /acquireExecutionLock\(projectRoot/);
  assert.match(testcaseRunner, /executionLock\?\.release\(\)/);
});

test('config, POM runtime and auth fixture share one pool contract', () => {
  for (const relativePath of [
    'playwright.config.ts',
    'fixtures/runtime-context.ts',
    'fixtures/auth.ts',
  ]) {
    const source = fs.readFileSync(path.join(TEMPLATE_ROOT, relativePath), 'utf8');
    assert.match(source, /parallel-pool\.js/);
  }
});
