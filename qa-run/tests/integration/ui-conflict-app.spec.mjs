import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startConflictServer } from '../fixtures/conflict-app/server.mjs';
import { resolveScriptPath } from '../../scripts/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/conflict-app');
const DATA_DIR = process.cwd();

function runNode(script, args) {
  return new Promise(resolve => {
    const child = spawn('node', [script, ...args], { env: { ...process.env } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('real browser maps requirements and catches same-session runtime mismatch', async t => {
  const { server, port } = await startConflictServer(0);
  t.after(() => { try { server.closeAllConnections?.(); server.close(); } catch {} });
  const page = 'conflict-order-detail';
  const result = await runNode(resolveScriptPath('ui-business-reconciliation.mjs'), [
    '--url', `http://127.0.0.1:${port}`, '--page', page,
    '--requirements', path.join(FIXTURE_DIR, 'requirements.json'), '--role', 'Staff',
    '--verify-runtime', '--runtime-action-selector', '#submit-error',
    '--runtime-action-label', 'Submit Order Error', '--runtime-expected-state', 'SUBMITTED',
  ]);
  assert.equal(result.code, 0, `Orchestrator failed:\n${result.stdout}\n${result.stderr}`);

  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', page);
  const trace = JSON.parse(fs.readFileSync(path.join(outDir, 'ui-requirement-traceability.json'), 'utf8'));
  const runtimeRow = trace.mappings.find(row => row.requirementId === 'REQ-ORD-006');
  assert.equal(runtimeRow.mappingStatus, 'CONFLICT');
  assert.ok(runtimeRow.evidenceLevels.includes('runtime_verified'));
  assert.equal(runtimeRow.runtimeEvidence.responseStatus, 500);
  assert.equal(runtimeRow.runtimeEvidence.uiSuccessVisible, true);
  assert.equal(runtimeRow.runtimeEvidence.persistenceVerified, false);

  const permissionRow = trace.mappings.find(row => row.requirementId === 'REQ-ORD-001');
  assert.equal(permissionRow.mappingStatus, 'CONFLICT');
  assert.ok(trace.mappings.some(row => row.requirementId === 'REQ-ORD-007' && row.mappingStatus === 'REQ_ONLY'));

  for (const name of ['ui-state-graph.json', 'transition-evidence.json', 'question-lifecycle.json',
    'resolved-business-rules.json', 'ui-business-impact-map.json', 'ui-business-guide.md']) {
    assert.ok(fs.existsSync(path.join(outDir, name)), `Missing ${name}`);
  }
});
