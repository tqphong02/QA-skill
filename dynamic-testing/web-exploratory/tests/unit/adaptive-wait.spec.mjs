import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installNetworkTracker, waitForNetworkQuiet } from '../../lib/wait.mjs';

function request(type = 'xhr') {
  return { resourceType: () => type };
}

test('Adaptive wait resolves from same-page request lifecycle without fixed sleep', async () => {
  const page = new EventEmitter();
  const tracker = installNetworkTracker(page);
  const req = request();
  page.emit('request', req);
  assert.equal(tracker.pendingCount(), 1);

  const waiting = waitForNetworkQuiet(page, { timeout: 250, quietMs: 20, pollMs: 5 });
  setTimeout(() => page.emit('requestfinished', req), 25);
  const result = await waiting;

  assert.equal(result.ready, true);
  assert.equal(result.pending, 0);
  assert.equal(result.tracked, true);
  tracker.dispose();
});

test('Adaptive wait ignores long-lived websocket connections', async () => {
  const page = new EventEmitter();
  const tracker = installNetworkTracker(page);
  page.emit('request', request('websocket'));
  const result = await waitForNetworkQuiet(page, { timeout: 100, quietMs: 10, pollMs: 5 });

  assert.equal(result.ready, true);
  assert.equal(result.pending, 0);
  tracker.dispose();
});

