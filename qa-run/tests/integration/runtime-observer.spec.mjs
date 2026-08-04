import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeObserver } from '../../scripts/helpers/runtime-observer.mjs';

test('Runtime Observer: Captures live events in memory and streams to disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runtime-observer-'));
  const eventsFile = path.join(tempDir, 'runtime-events.json');
  const observer = createRuntimeObserver(null, { eventsFile });
  assert.equal(typeof observer.getEvents, 'function');
  assert.equal(typeof observer.clearEvents, 'function');
  assert.ok(Array.isArray(observer.getEvents()));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Runtime Observer: Native mode records bounded successful API responses without request bodies', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runtime-observer-'));
  const eventsFile = path.join(tempDir, 'runtime-events.json');
  const page = new EventEmitter();
  const observer = createRuntimeObserver(page, { eventsFile, captureSuccessfulResponses: true });
  page.emit('response', {
    status: () => 200,
    statusText: () => 'OK',
    url: () => 'https://example.test/api/orders?account=123',
    headers: () => ({ 'content-type': 'application/json' }),
    request: () => ({ method: () => 'GET', resourceType: () => 'xhr' }),
  });
  await new Promise(resolve => setImmediate(resolve));
  const response = observer.getEvents().find(event => event.type === 'HTTP_RESPONSE');
  assert.ok(response);
  assert.equal(response.payload.status, 200);
  assert.equal(response.payload.resourceType, 'xhr');
  assert.doesNotMatch(JSON.stringify(response), /account=123/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Runtime Observer: Captures and redacts browser failures', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runtime-observer-'));
  const eventsFile = path.join(tempDir, 'runtime-events.json');
  const page = new EventEmitter();
  const observer = createRuntimeObserver(page, { eventsFile });

  page.emit('console', {
    type: () => 'error',
    text: () => 'Request failed for user@example.com with Bearer secret-token',
  });
  page.emit('pageerror', new Error('Crash for user@example.com'));
  page.emit('requestfailed', {
    method: () => 'POST',
    url: () => 'https://example.test/orders?access_token=secret',
    failure: () => ({ errorText: 'net::ERR_FAILED Bearer secret-token' }),
  });
  page.emit('response', {
    status: () => 500,
    statusText: () => 'Internal Server Error',
    url: () => 'https://example.test/orders?account=123',
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({
      error: 'ORDER_FAILED',
      token: 'secret-token',
      email: 'user@example.com',
    }),
    request: () => ({ method: () => 'POST' }),
  });
  page.emit('response', {
    status: () => 200,
    statusText: () => 'OK',
    url: () => 'https://example.test/graphql?operation=Checkout',
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({
      data: { checkout: null },
      errors: [{ message: 'Checkout failed', token: 'secret-token' }],
    }),
    request: () => ({ method: () => 'POST' }),
  });

  await new Promise(resolve => setImmediate(resolve));

  const events = observer.getEvents();
  assert.ok(events.some(event => event.type === 'CONSOLE_ERROR'));
  assert.ok(events.some(event => event.type === 'PAGE_CRASH_ERROR'));
  assert.ok(events.some(event => event.type === 'REQUEST_FAILED'));
  assert.ok(events.some(event => event.type === 'HTTP_FAILURE'));
  assert.ok(events.some(event => event.type === 'GRAPHQL_ERROR'));

  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /user@example\.com/);
  assert.match(serialized, /<redacted>/);
  const transition = observer.summarizeSince(0, { actionId: 'submit-order' });
  assert.equal(transition.action_id, 'submit-order');
  assert.ok(transition.counts.HTTP_FAILURE >= 1);
  assert.ok(transition.counts.CONSOLE_ERROR >= 1);
  assert.equal(observer.getEventsSince(observer.getCursor()).length, 0);
  assert.ok(fs.existsSync(eventsFile));
  fs.rmSync(tempDir, { recursive: true, force: true });
});
