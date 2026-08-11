import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireAtomicLock, releaseAtomicLock } from '../../scripts/helpers/data-factory.mjs';

test('Resource Lock: Atomic wx flag prevents duplicate lock acquisition by another worker', () => {
  const resourceName = `test_resource_${Date.now()}`;

  // Worker 1 acquires lock
  const ok1 = acquireAtomicLock(resourceName, 1);
  assert.equal(ok1, true, 'Worker 1 should acquire lock');

  // Worker 2 attempts acquire on same resource
  const ok2 = acquireAtomicLock(resourceName, 2);
  assert.equal(ok2, false, 'Worker 2 should fail to acquire locked resource');

  // Worker 1 releases lock
  const released = releaseAtomicLock(resourceName, 1);
  assert.equal(released, true, 'Worker 1 should release lock');

  // Worker 2 can now acquire lock
  const ok3 = acquireAtomicLock(resourceName, 2);
  assert.equal(ok3, true, 'Worker 2 should acquire lock after release');

  // Cleanup
  releaseAtomicLock(resourceName, 2);
});
