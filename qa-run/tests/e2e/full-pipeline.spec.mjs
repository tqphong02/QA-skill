import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('Full Pipeline E2E: Run manifest start and finish cycle', () => {
  // Start manifest
  const startStdout = execSync('node scripts/run-manifest.mjs start --workers 2 --mode FULL_E2E', { encoding: 'utf8' });
  assert.match(startStdout, /Manifest initialized/);
  const runIdMatch = startStdout.match(/run-\d+/);
  assert.ok(runIdMatch, 'Run ID should be generated');

  const runId = runIdMatch[0];

  // Finish manifest
  const finishStdout = execSync(`node scripts/run-manifest.mjs finish ${runId} --verdict PASS --total-cases 10 --passed 10`, { encoding: 'utf8' });
  assert.match(finishStdout, /Manifest finalized/);
  assert.match(finishStdout, /Verdict:\s+PASS/);
});
