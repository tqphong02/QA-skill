import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScriptPath } from '../../scripts/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');
const DATA_DIR = process.cwd();

function runScript(scriptName, args) {
  const scriptPath = resolveScriptPath(scriptName);
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

test('UI Reconciliation Test 1: Full pipeline execution on page order-detail', () => {
  const res = runScript('ui-business-reconciliation.mjs', ['--page', 'test-order-detail']);
  assert.equal(res.code, 0, `Orchestrator failed: ${res.stderr}`);

  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  assert.ok(fs.existsSync(outDir), 'Should create test-order-detail output directory');

  const expectedFiles = [
    'ui-components.json',
    'observed-flow.json',
    'business-conflicts.json',
    'unresolved-rules.json',
    'clarification-qna.json',
    'ui-business-guide.md',
  ];

  for (const f of expectedFiles) {
    assert.ok(fs.existsSync(path.join(outDir, f)), `Missing expected output file: ${f}`);
  }
});

test('UI Reconciliation Test 2: Intent classification', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const componentsData = readJSON(path.join(outDir, 'ui-components.json'));

  assert.ok(componentsData?.components, 'Should have components array');
  const approveComponent = componentsData.components.find(c => c.label === 'Approve');
  assert.ok(approveComponent, 'Should find Approve button');
  assert.equal(approveComponent.intent, 'APPROVE');
  assert.equal(approveComponent.expectedState, 'APPROVED');
});

test('UI Reconciliation Test 3: Observed Flow state sequence builder', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const flowData = readJSON(path.join(outDir, 'observed-flow.json'));

  assert.ok(flowData?.observedStates, 'Should extract observed states');
  assert.ok(flowData.observedStates.includes('DRAFT'), 'Should observe DRAFT state');
  assert.ok(flowData.observedStates.includes('APPROVED'), 'Should observe APPROVED state');
  assert.ok(flowData.transitions.length > 0, 'Should build transitions sequence');
});

test('UI Reconciliation Test 4: Reconciler classification & PERMISSION_CONFLICT detection', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const conflictsData = readJSON(path.join(outDir, 'business-conflicts.json'));

  assert.ok(conflictsData?.conflicts, 'Should have conflicts array');
  const permConflict = conflictsData.conflicts.find(c => c.type === 'PERMISSION_CONFLICT');
  assert.ok(permConflict, 'Should detect PERMISSION_CONFLICT when Staff role sees Approve button');
  assert.equal(permConflict.owner, 'BA');
});

test('UI Reconciliation Test 5: Ambiguity detector 10 patterns', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const ambiguityData = readJSON(path.join(outDir, 'unresolved-rules.json'));

  assert.ok(ambiguityData?.unresolvedRules, 'Should detect unresolved rules');
  assert.ok(ambiguityData.totalUnresolvedRules > 0, 'Should detect unresolved business rules');
});

test('UI Reconciliation Test 6: Q&A Generator BA/PO/Dev assignment', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const qnaData = readJSON(path.join(outDir, 'clarification-qna.json'));

  assert.ok(qnaData?.questions, 'Should have questions array');
  assert.ok(qnaData.byOwner.BA || qnaData.byOwner.PO || qnaData.byOwner.Dev, 'Should classify questions by owner');
});

test('UI Reconciliation Test 7: 12-Section Markdown Guide generation', () => {
  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', 'test-order-detail');
  const guidePath = path.join(outDir, 'ui-business-guide.md');
  const content = fs.readFileSync(guidePath, 'utf8');

  assert.ok(content.includes('# UI Business Reconciliation:'), 'Header missing');
  assert.ok(content.includes('## 1. Tổng quan mục tiêu trang'), 'Section 1 missing');
  assert.ok(content.includes('## 4. Business flow suy ra từ UI'), 'Section 4 missing');
  assert.ok(content.includes('## 8. Điểm mâu thuẫn'), 'Section 8 missing');
  assert.ok(content.includes('## 10. Q&A cần BA, PO, Dev xác nhận'), 'Section 10 missing');
  assert.ok(content.includes('## 12. Evidence và source reference'), 'Section 12 missing');
});
