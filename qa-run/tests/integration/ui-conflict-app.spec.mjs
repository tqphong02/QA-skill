import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startConflictServer } from '../fixtures/conflict-app/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const DATA_DIR = process.cwd();

test('Integration Test: Real Browser Reconciliation against Conflict App Fixture & Oracle', async (t) => {
  const { server, port } = await startConflictServer(0);

  t.after(() => {
    try {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      server.close();
    } catch {}
  });

  const orchestratorPath = path.join(SCRIPTS_DIR, 'ui-business-reconciliation.mjs');
  const result = spawnSync('node', [
    orchestratorPath,
    '--url', `http://localhost:${port}`,
    '--page', 'conflict-order-detail'
  ], {
    encoding: 'utf8',
    env: { ...process.env },
  });

  assert.equal(result.status, 0, `Orchestrator failed: ${result.stderr}`);

  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'conflict-order-detail');
  assert.ok(fs.existsSync(outDir), 'Output directory should exist');

  // Load Oracle JSON
  const oraclePath = path.join(FIXTURES_DIR, 'conflict-app', 'oracle.json');
  const oracleData = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));

  // Load Conflicts Output
  const conflictsData = JSON.parse(fs.readFileSync(path.join(outDir, 'business-conflicts.json'), 'utf8'));

  // Verify all 6 planted conflicts from Oracle are detected
  const conflicts = conflictsData.conflicts || [];
  assert.ok(conflicts.length >= oracleData.totalPlantedConflicts, `Should detect at least ${oracleData.totalPlantedConflicts} conflicts`);

  // Bug 1: Staff Approve (PERMISSION_CONFLICT)
  const b1 = conflicts.find(c => c.type === 'PERMISSION_CONFLICT' && c.component === 'Approve');
  assert.ok(b1, 'Oracle Bug 1: Staff sees Approve button should be detected');
  assert.ok(b1.evidenceBundle, 'Evidence bundle must exist for Bug 1');

  // Verify evidence keys from Oracle expectedEvidence
  const expectedKeysBug1 = oracleData.expectedConflicts.find(e => e.id === 'BUG_1_STAFF_APPROVE').expectedEvidence;
  for (const k of expectedKeysBug1) {
    assert.ok(b1.evidenceBundle[k] !== undefined, `Evidence field ${k} should be present (even if null) in Bug 1 evidence bundle`);
  }

  // Bug 2: Required Field Mismatch (Amount)
  const b2 = conflicts.find(c => c.component === 'Amount' || c.question.includes('Amount'));
  assert.ok(b2, 'Oracle Bug 2: Amount required in UI vs doc should be detected');

  // Bug 3: Delete No Confirm (Delete)
  const b3 = conflicts.find(c => c.component === 'Delete');
  assert.ok(b3, 'Oracle Bug 3: Delete soft vs permanent ambiguity should be detected');

  // Bug 4: Save Draft and Submit same API
  const b4 = conflicts.find(c => c.component === 'Save Draft');
  assert.ok(b4, 'Oracle Bug 4: Save Draft vs Submit state distinction should be detected');

  // Bug 5: Status Direct Select Jump
  const b5 = conflicts.find(c => c.component === 'Status');
  assert.ok(b5, 'Oracle Bug 5: Status direct select jump should be detected');

  // Bug 6: UI Success Toast but API HTTP 500 Error
  const b6 = conflicts.find(c => c.component === 'Submit Order Error' || c.question.includes('500'));
  assert.ok(b6, 'Oracle Bug 6: UI Toast success but API 500 runtime mismatch should be detected');

  console.log(`\n  ✅ Oracle Verification Passed: Phát hiện đầy đủ ${oracleData.totalPlantedConflicts} conflict đã định nghĩa trong fixture oracle!`);

  // Verify output files
  assert.ok(fs.existsSync(path.join(outDir, 'ui-state-graph.json')), 'ui-state-graph.json missing');
  assert.ok(fs.existsSync(path.join(outDir, 'transition-evidence.json')), 'transition-evidence.json missing');
  assert.ok(fs.existsSync(path.join(outDir, 'question-lifecycle.json')), 'question-lifecycle.json missing');
  assert.ok(fs.existsSync(path.join(outDir, 'resolved-business-rules.json')), 'resolved-business-rules.json missing');
  assert.ok(fs.existsSync(path.join(outDir, 'ui-business-impact-map.json')), 'ui-business-impact-map.json missing');
  assert.ok(fs.existsSync(path.join(outDir, 'ui-business-guide.md')), 'ui-business-guide.md missing');
});
