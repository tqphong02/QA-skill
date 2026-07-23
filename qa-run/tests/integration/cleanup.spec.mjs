import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerCleanupItem, performCleanup } from '../../scripts/data-factory.mjs';

test('Cleanup: Idempotent teardown registers and cleans cleanup queue', async () => {
  const wId = 999;
  const DATA = process.env.QA_DATA_DIR || process.cwd();
  const cleanupFile = path.join(DATA, 'evidence', `.worker-${wId}-cleanup.json`);

  // Register item
  registerCleanupItem({ entity: 'user_profile', name: '[w999_test]_JohnDoe' }, wId);
  assert.equal(fs.existsSync(cleanupFile), true);

  // Perform teardown
  await performCleanup(wId);
  assert.equal(fs.existsSync(cleanupFile), false, 'Cleanup file should be deleted after teardown');
});
