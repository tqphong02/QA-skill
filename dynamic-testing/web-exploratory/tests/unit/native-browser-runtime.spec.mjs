import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  LOCATOR_PRIORITY,
  MAX_ACTIONS_PER_AGENT_STEP,
  MAX_NATIVE_WORKERS,
  NATIVE_OBSERVATION_PROFILES,
  computeNativeStateDelta,
  normalizeNativeBrowserLaunchError,
  resolveNativeObservationProfile,
  validateReadOnlyActionBatch,
  validateNativeBrowserOptions,
  validatePoolConfig,
  sortLocatorCandidates,
} from '../../lib/native-browser.mjs';
import { chromiumLaunchOptions } from '../../scripts/helpers/browser-launch.mjs';

test('native runtime lets Playwright select the headless-shell browser by default', () => {
  const previous = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  try {
    delete process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    const options = chromiumLaunchOptions({ platform: 'darwin' });
    assert.equal('executablePath' in options, false);
    assert.equal(options.headless, true);
    assert.deepEqual(options.args, []);
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_EXECUTABLE_PATH = previous;
  }
});

test('native runtime applies no-sandbox flags only on Linux', () => {
  const options = chromiumLaunchOptions({ env: {}, platform: 'linux' });
  assert.deepEqual(options.args, ['--no-sandbox', '--disable-setuid-sandbox']);
});

test('native runtime classifies a macOS sandbox launch denial as non-retryable', () => {
  const failure = normalizeNativeBrowserLaunchError({
    message: 'Target page, context or browser has been closed',
    log: ['bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)'],
  });
  assert.equal(failure.code, 'BROWSER_RUNTIME_PERMISSION_DENIED');
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /do not retry/i);
});

test('native runtime keeps custom executable selection explicit', () => {
  const previous = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  try {
    process.env.PLAYWRIGHT_EXECUTABLE_PATH = '/tmp/intentional-browser-binary';
    assert.equal(chromiumLaunchOptions({ platform: 'darwin' }).executablePath, '/tmp/intentional-browser-binary');
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_EXECUTABLE_PATH = previous;
  }
});

test('native locator resolution keeps the requested priority and deduplicates candidates', () => {
  const candidates = sortLocatorCandidates([
    { strategy: 'XPATH', value: '/html/body/button[1]', reason: 'higher priority selectors failed' },
    { strategy: 'ROLE_LABEL_TEXT', value: 'Save' },
    { strategy: 'CSS', value: 'button[name="save"]' },
    { strategy: 'ID', value: 'save-button' },
    { strategy: 'DATA_TEST_ID', value: 'save-button' },
    { strategy: 'DATA_TEST_ID', value: 'save-button' },
  ]);
  assert.deepEqual(candidates.map(item => item.strategy), [
    'DATA_TEST_ID',
    'ID',
    'STABLE_CSS',
    'ROLE_LABEL_TEXT',
    'XPATH',
  ]);
  assert.deepEqual(LOCATOR_PRIORITY.slice(0, 3), ['DATA_TEST_ID', 'ID', 'STABLE_CSS']);
});

test('native worker pool rejects unsafe shared profile or CDP state', () => {
  assert.deepEqual(validatePoolConfig({ workers: 1, cdpUrl: 'http://127.0.0.1:9222' }), {
    workers: 1,
    isolated: false,
  });
  assert.throws(
    () => validatePoolConfig({ workers: 2, cdpUrl: 'http://127.0.0.1:9222' }),
    error => error.code === 'SHARED_BROWSER_STATE_UNSAFE',
  );
  assert.throws(
    () => validatePoolConfig({ workers: 2, profileDir: '/tmp/profile' }),
    error => error.code === 'SHARED_BROWSER_STATE_UNSAFE',
  );
});

test('native worker count is bounded to one through four without clamping invalid input', () => {
  assert.equal(MAX_NATIVE_WORKERS, 4);
  assert.throws(
    () => validatePoolConfig({ workers: 0 }),
    error => error.code === 'INVALID_NATIVE_WORKER_COUNT',
  );
  assert.throws(
    () => validatePoolConfig({ workers: 5 }),
    error => error.code === 'INVALID_NATIVE_WORKER_COUNT',
  );
});

test('native browser options use tested-project data paths and explicit auth mode inputs', () => {
  const options = validateNativeBrowserOptions({
    dataDir: '/tmp/qa-project',
    runId: 'orders/run 1',
    workerId: 2,
    cdpUrl: 'http://127.0.0.1:9222',
    headless: false,
  });
  assert.equal(options.dataDir, path.resolve('/tmp/qa-project'));
  assert.equal(options.runId, 'orders-run-1');
  assert.equal(options.workerId, 2);
  assert.equal(options.cdpUrl, 'http://127.0.0.1:9222');
  assert.equal(options.headless, false);
  assert.equal(options.profileDir, '');
});

test('native runtime batches only bounded read-only actions', () => {
  assert.equal(MAX_ACTIONS_PER_AGENT_STEP, 5);
  assert.deepEqual(
    validateReadOnlyActionBatch([{ type: 'navigate' }, { type: 'extract' }, { type: 'screenshot' }])
      .map(action => action.type),
    ['navigate', 'extract', 'screenshot'],
  );
  assert.throws(
    () => validateReadOnlyActionBatch([{ type: 'click' }]),
    error => error.code === 'ACTION_BATCH_WRITE_BLOCKED',
  );
  assert.throws(
    () => validateReadOnlyActionBatch(Array.from({ length: 6 }, () => ({ type: 'wait' }))),
    error => error.code === 'ACTION_BATCH_LIMIT',
  );
});

test('native observations default to a compact token profile with explicit escalation', () => {
  const compact = resolveNativeObservationProfile();
  const full = resolveNativeObservationProfile('full');
  assert.equal(compact.name, 'compact');
  assert.equal(compact.maxItems, 32);
  assert.equal(compact.maxChars, 2200);
  assert.equal(compact.includeLocatorCandidates, false);
  assert.equal(full.maxItems, 200);
  assert.equal(full.includeLocatorCandidates, true);
  assert.equal(NATIVE_OBSERVATION_PROFILES.standard.maxChars, 8000);
});

test('native state delta exposes deterministic progress signals without model confidence', () => {
  const delta = computeNativeStateDelta(
    { url: 'https://app.test/orders', title: 'Orders', headings: ['Orders'], content_fingerprint: 'a', interactive_count: 2 },
    { url: 'https://app.test/orders/1', title: 'Order details', headings: ['Order details'], content_fingerprint: 'b', interactive_count: 4 },
    { failures: [] },
  );
  assert.equal(delta.url_changed, true);
  assert.equal(delta.content_changed, true);
  assert.equal(delta.progress_classification, 'STRONG_PROGRESS');
  assert.ok(delta.progress_score >= 0.5);
});

test('native state delta recognizes form and dialog changes without exposing input values', () => {
  const delta = computeNativeStateDelta(
    {
      url: 'https://app.test/orders/new',
      title: 'New order',
      headings: ['New order'],
      content_fingerprint: 'same-content',
      form_fingerprint: 'form-before',
      interactive_count: 4,
      dialog_count: 0,
    },
    {
      url: 'https://app.test/orders/new',
      title: 'New order',
      headings: ['New order'],
      content_fingerprint: 'same-content',
      form_fingerprint: 'form-after',
      interactive_count: 4,
      dialog_count: 1,
    },
    { failures: [] },
  );
  assert.equal(delta.form_state_changed, true);
  assert.equal(delta.dialog_count_changed, true);
  assert.equal(delta.meaningful_change_count, 2);
  assert.equal(delta.progress_classification, 'PROGRESS');
  assert.equal('form_fingerprint' in delta, false);
});

test('native browser options normalize an explicit allowed-origin boundary', () => {
  const options = validateNativeBrowserOptions({
    dataDir: '/tmp/qa-project',
    runId: 'bounded-task',
    allowedOrigins: ['https://app.test/path', 'app.test'],
  });
  assert.deepEqual(options.allowedOrigins, ['https://app.test']);
});
