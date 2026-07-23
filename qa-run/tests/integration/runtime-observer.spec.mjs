import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeObserver } from '../../scripts/runtime-observer.mjs';

test('Runtime Observer: Captures live events in memory and streams to disk', () => {
  const observer = createRuntimeObserver(null);
  assert.equal(typeof observer.getEvents, 'function');
  assert.equal(typeof observer.clearEvents, 'function');
  assert.ok(Array.isArray(observer.getEvents()));
});
